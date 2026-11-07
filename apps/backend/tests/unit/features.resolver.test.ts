import { FeatureGraphSchema } from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import {
  evaluateFeatureEffects,
  FeatureBindingError,
  type FeatureInstance,
  proficiencyBonusFor,
  resolveFeatureGraph,
  type ResolvedFeatureGraph,
} from "#src/modules/features/domain/FeatureResolver";
import { FeatureResolutionCache } from "#src/modules/features/service/FeatureResolutionCache";

const CHOSEN = "d0000000-0000-4000-8000-000000000009";

const constant = (value: number) => ({ type: "CONST", value });
const variable = (key: string) => ({ type: "VAR", key });

const graph = (input: Record<string, unknown>) =>
  FeatureGraphSchema.parse({
    sections: [],
    parameters: [],
    choices: [],
    resources: [],
    scalingTracks: [],
    activations: [],
    effects: [],
    supersedes: [],
    ...input,
  });

const bindingIssues = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof FeatureBindingError) {
      return error.issues.map((issue) => issue.message);
    }

    throw error;
  }

  return [];
};

describe("resolving a feature", () => {
  const martialArts = graph({
    parameters: [
      { key: "bonus", valueType: "INTEGER", defaultValue: 1 },
      { key: "weapon", valueType: "ASSET_REF", required: true },
      { key: "flag", valueType: "BOOLEAN", defaultValue: true },
      { key: "reach", valueType: "DISTANCE", defaultValue: { amount: 5, unit: "ft" } },
    ],
    choices: [
      {
        key: "style",
        choiceType: "OPTION",
        minimumSelections: 1,
        maximumSelections: 2,
        displayOrder: 0,
        options: [
          { code: "dueling", label: "Dueling", value: 2 },
          { code: "defense", label: "Defense" },
        ],
        optionFilter: { assetTypes: ["FEAT"] },
      },
    ],
    scalingTracks: [
      {
        key: "die",
        valueType: "DIE",
        scaleBy: "CLASS_LEVEL",
        values: [
          { minimumLevel: 1, value: { count: 1, faces: 4 } },
          { minimumLevel: 5, value: { count: 1, faces: 6 } },
          { minimumLevel: 11, value: { count: 1, faces: 8 } },
        ],
      },
      {
        key: "uses",
        valueType: "INTEGER",
        scaleBy: "SOURCE_LEVEL",
        values: [{ minimumLevel: 2, value: 2 }],
      },
    ],
    resources: [
      {
        key: "ki",
        name: "Ki",
        maximumExpression: variable("level.class"),
        recovery: "SHORT_REST",
      },
    ],
    activations: [
      {
        key: "flurry",
        activationType: "BONUS_ACTION",
        duration: { unit: "ROUND", amount: variable("param.bonus") },
        costs: [{ costType: "RESOURCE", resourceKey: "ki", amountExpression: constant(1) }],
      },
    ],
    effects: [
      {
        key: "late",
        displayOrder: 5,
        payload: { type: "INFORMATION", message: "Shown last" },
      },
      {
        key: "strike",
        activationKey: "flurry",
        displayOrder: 1,
        payload: {
          type: "DAMAGE",
          damageType: "bludgeoning",
          dice: { ref: "scale.die" },
          amount: variable("ability.dex.modifier"),
        },
      },
      {
        key: "ac",
        displayOrder: 0,
        condition: { type: "ABILITY", ability: "wis", operator: "GTE", value: 12 },
        payload: {
          type: "BASE_VALUE",
          stat: "ac",
          value: {
            type: "ADD",
            args: [constant(10), variable("ability.dex.modifier"), variable("ability.wis.modifier")],
          },
        },
      },
      {
        key: "ki_info",
        displayOrder: 2,
        payload: { type: "RESOURCE", resourceKey: "ki", amount: variable("resource.ki.max") },
      },
    ],
  });

  const actor = { characterLevel: 5, classLevel: 5, abilities: { dex: 16, wis: 14 } };

  it("binds parameters, choices and scaling and computes all values", () => {
    const resolved = resolveFeatureGraph(
      martialArts,
      { parameters: { weapon: CHOSEN, bonus: 3 }, choices: { style: ["dueling", CHOSEN] } },
      actor,
      new Set([CHOSEN]),
    );

    expect(resolved.parameters).toEqual([
      { key: "bonus", value: 3, source: "BINDING" },
      { key: "weapon", value: CHOSEN, source: "BINDING" },
      { key: "flag", value: true, source: "DEFAULT" },
      { key: "reach", value: { amount: 5, unit: "ft" }, source: "DEFAULT" },
    ]);
    expect(resolved.choices).toEqual([
      {
        key: "style",
        selections: [
          { code: "dueling", label: "Dueling", value: 2, assetId: null },
          { code: null, label: null, value: null, assetId: CHOSEN },
        ],
      },
    ]);
    expect(resolved.scaling).toEqual([
      { key: "die", level: 5, value: { count: 1, faces: 6 } },
      { key: "uses", level: null, value: null },
    ]);
    expect(resolved.resources).toEqual([
      { key: "ki", name: "Ki", maximum: 5, recovery: "SHORT_REST" },
    ]);
    expect(resolved.activations[0]).toMatchObject({
      duration: { unit: "ROUND", amount: 3 },
      costs: [{ costType: "RESOURCE", resourceKey: "ki", amount: 1 }],
    });
    expect(resolved.effects.map((effect) => [effect.key, effect.applies, effect.payload])).toEqual([
      ["ac", "TRUE", { type: "BASE_VALUE", stat: "ac", value: 15 }],
      [
        "strike",
        "TRUE",
        { type: "DAMAGE", damageType: "bludgeoning", dice: { count: 1, faces: 6 }, amount: 3 },
      ],
      ["ki_info", "TRUE", { type: "RESOURCE", resourceKey: "ki", amount: 5 }],
      ["late", "TRUE", { type: "INFORMATION", message: "Shown last" }],
    ]);
    expect(resolved.reasons).toEqual(["Missing level for scaling 'uses'"]);
  });

  it.each([
    [4, { count: 1, faces: 4 }],
    [5, { count: 1, faces: 6 }],
    [10, { count: 1, faces: 6 }],
    [11, { count: 1, faces: 8 }],
    [20, { count: 1, faces: 8 }],
  ])("uses the highest step reached at class level %i", (classLevel, die) => {
    const resolved = resolveFeatureGraph(
      martialArts,
      { parameters: { weapon: CHOSEN }, choices: { style: ["defense"] } },
      { ...actor, classLevel },
    );

    expect(resolved.scaling[0]?.value).toEqual(die);
  });

  it("leaves values unknown below the first step and when the actor lacks data", () => {
    const resolved = resolveFeatureGraph(
      martialArts,
      { parameters: { weapon: CHOSEN }, choices: { style: ["defense"] } },
      { sourceLevel: 1 },
    );

    expect(resolved.scaling[1]).toEqual({ key: "uses", level: 1, value: null });
    expect(resolved.resources[0]?.maximum).toBeNull();
    expect(resolved.effects.find((effect) => effect.key === "ac")?.applies).toBe("UNKNOWN");
    expect(resolved.reasons).toEqual(
      expect.arrayContaining(["Missing level for scaling 'die'", "Missing ability 'wis'"]),
    );
  });

  it("evaluates conditions to false", () => {
    const resolved = resolveFeatureGraph(
      martialArts,
      { parameters: { weapon: CHOSEN }, choices: { style: ["defense"] } },
      { ...actor, abilities: { dex: 16, wis: 10 } },
    );

    expect(resolved.effects.find((effect) => effect.key === "ac")?.applies).toBe("FALSE");
  });

  it("refuses bindings that do not fit", () => {
    expect(
      bindingIssues(() =>
        resolveFeatureGraph(
          martialArts,
          {
            parameters: { bonus: "high", unknown: 1 },
            choices: { style: ["dueling", "dueling", "archery"], other: [] },
          },
          actor,
        ),
      ),
    ).toEqual([
      "Unknown parameter",
      "Invalid input: expected number, received string",
      "Required parameter needs a binding or a default",
      "Unknown choice",
      "Selections must be unique",
      "Choose between 1 and 2",
      "'archery' is not an option of this choice",
    ]);
  });

  it("only accepts filtered assets the caller has checked", () => {
    expect(
      bindingIssues(() =>
        resolveFeatureGraph(
          martialArts,
          { parameters: { weapon: CHOSEN }, choices: { style: [CHOSEN] } },
          actor,
        ),
      ),
    ).toEqual([`'${CHOSEN}' is not an option of this choice`]);
  });

  it("derives the proficiency bonus from the character level", () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(proficiencyBonusFor)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);

    const resolved = resolveFeatureGraph(
      graph({
        effects: [
          {
            key: "pb",
            displayOrder: 0,
            payload: { type: "MODIFIER", stat: "x", amount: variable("proficiencyBonus") },
          },
        ],
      }),
      {},
      { characterLevel: 9 },
    );

    expect(resolved.effects[0]?.payload).toEqual({ type: "MODIFIER", stat: "x", amount: 4 });
  });
});

describe("combining features of one actor", () => {
  const effect = (key: string, payload: Record<string, unknown>, activationKey: string | null = null) => ({
    key,
    activationKey,
    effectType: payload.type as ResolvedFeatureGraph["effects"][number]["effectType"],
    applies: "TRUE" as const,
    payload: payload as ResolvedFeatureGraph["effects"][number]["payload"],
  });

  const resolved = (effects: ResolvedFeatureGraph["effects"]): ResolvedFeatureGraph => ({
    resolved: true,
    parameters: [],
    choices: [],
    scaling: [],
    resources: [],
    activations: [],
    effects,
    reasons: [],
  });

  const instance = (
    assetId: string,
    effects: ResolvedFeatureGraph["effects"],
    options: Partial<FeatureInstance> = {},
  ): FeatureInstance => ({
    assetId,
    stackingMode: "STACK",
    supersedes: [],
    resolved: resolved(effects),
    ...options,
  });

  const bonus = (amount: number) => effect("bonus", { type: "MODIFIER", stat: "ac", amount });

  it("adds up passive modifiers and keeps the highest base value", () => {
    const result = evaluateFeatureEffects([
      instance("a", [bonus(1), effect("base", { type: "BASE_VALUE", stat: "ac", value: 13 })]),
      instance("b", [
        bonus(2),
        effect("base", { type: "BASE_VALUE", stat: "ac", value: 15 }),
        effect("grant", { type: "GRANT", grantType: "RESISTANCE", value: "fire" }),
        effect("again", { type: "GRANT", grantType: "RESISTANCE", value: "fire" }),
        effect("adv", { type: "ADVANTAGE", mode: "ADVANTAGE", on: "save.str" }),
        effect("active", { type: "MODIFIER", stat: "ac", amount: 10 }, "use"),
        { ...bonus(5), key: "unknown", applies: "UNKNOWN" },
      ]),
    ]);

    expect(result.totals).toEqual({
      modifiers: { ac: 3 },
      baseValues: { ac: 15 },
      grants: [{ grantType: "RESISTANCE", value: "fire" }],
      advantages: [{ mode: "ADVANTAGE", on: "save.str" }],
    });
    expect(result.effects).toHaveLength(9);
  });

  it.each([
    ["NONE", ["APPLIED", "DUPLICATE", "DUPLICATE"], 1],
    ["STACK", ["APPLIED", "APPLIED", "APPLIED"], 6],
    ["REPLACE", ["DUPLICATE", "DUPLICATE", "APPLIED"], 2],
    ["HIGHEST", ["APPLIED", "APPLIED", "APPLIED"], 3],
  ] as const)("follows stacking mode %s for repeated grants", (stackingMode, statuses, total) => {
    const result = evaluateFeatureEffects(
      [1, 3, 2].map((amount) => instance("same", [bonus(amount)], { stackingMode })),
    );

    expect(result.instances.map((item) => item.status)).toEqual(statuses);
    expect(result.totals.modifiers.ac).toBe(total);
  });

  it("drops replaced features and the effects of upgraded ones", () => {
    const result = evaluateFeatureEffects([
      instance("old", [bonus(1)]),
      instance("base", [bonus(2)]),
      instance("improved", [bonus(4)], { supersedes: [{ targetAssetId: "base", mode: "UPGRADE" }] }),
      instance("new", [bonus(8)], {
        supersedes: [
          { targetAssetId: "old", mode: "REPLACE" },
          { targetAssetId: "missing", mode: "REPLACE" },
        ],
      }),
    ]);

    expect(result.instances.map((item) => item.status)).toEqual([
      "REPLACED",
      "UPGRADED",
      "APPLIED",
      "APPLIED",
    ]);
    expect(result.totals.modifiers.ac).toBe(12);
  });

  it("lets replacing win over upgrading the same target", () => {
    const result = evaluateFeatureEffects([
      instance("target", [bonus(1)]),
      instance("up", [], { supersedes: [{ targetAssetId: "target", mode: "UPGRADE" }] }),
      instance("re", [], { supersedes: [{ targetAssetId: "target", mode: "REPLACE" }] }),
    ]);

    expect(result.instances[0]?.status).toBe("REPLACED");
  });
});

describe("feature resolution cache", () => {
  const value = { resolved: true } as ResolvedFeatureGraph;
  const key = (overrides: Record<string, unknown> = {}) =>
    FeatureResolutionCache.keyOf({
      featureId: "f",
      assetId: "a",
      version: 1,
      assetVersion: 1,
      rulesetId: "r",
      bindings: { parameters: { a: 1, b: 2 } },
      actor: { characterLevel: 3 },
      allowedSelections: [],
      ...overrides,
    });

  it("gives equal keys for equal input regardless of key order", () => {
    expect(key({ bindings: { parameters: { b: 2, a: 1 } } })).toBe(key());
    expect(key({ version: 2 })).not.toBe(key());
    expect(key({ assetVersion: 2 })).not.toBe(key());
    expect(key({ rulesetId: "s" })).not.toBe(key());
    expect(key({ actor: { characterLevel: 4 } })).not.toBe(key());
    expect(key({ allowedSelections: ["x"] })).not.toBe(key());
  });

  it("evicts the least recently used entry and drops a feature on invalidation", () => {
    const cache = new FeatureResolutionCache(2);

    cache.set("one", ["f1", "a1"], value);
    cache.set("two", ["f2", "a2"], value);
    cache.get("one");
    cache.set("three", ["f3", "a3"], value);

    expect(cache.get("two")).toBeUndefined();
    expect(cache.get("one")).toBe(value);

    cache.invalidate("a1");

    expect(cache.get("one")).toBeUndefined();
    expect(cache.get("three")).toBe(value);
    expect(cache.size).toBe(1);
  });
});
