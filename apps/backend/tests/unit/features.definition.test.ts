import { CreateFeatureSchema } from "#src/modules/features/domain/dto/CreateFeatureDto";
import { UpdateFeatureSchema } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import {
  collectAssetReferences,
  validateFeatureDefinition,
} from "#src/modules/features/domain/FeatureDefinition";

const ASSET = "d0000000-0000-4000-8000-000000000001";
const OTHER = "d0000000-0000-4000-8000-000000000002";

const constant = (value: number) => ({ type: "CONST", value });
const variable = (key: string) => ({ type: "VAR", key });

const parse = (input: Record<string, unknown>) =>
  CreateFeatureSchema.safeParse({ name: "Rage", featureType: "ACTIVE", ...input });

const messages = (input: Record<string, unknown>) => {
  const result = parse(input);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

/** A complete definition that uses every part. */
const rage = {
  parameters: [
    { key: "bonus", valueType: "INTEGER", defaultValue: 2 },
    { key: "die", valueType: "DIE", defaultValue: { count: 1, faces: 6 } },
    { key: "weapon", valueType: "ASSET_REF", defaultValue: ASSET },
  ],
  choices: [
    {
      key: "path",
      choiceType: "OPTION",
      minimumSelections: 1,
      maximumSelections: 1,
      displayOrder: 0,
      options: [
        { code: "berserker", label: "Berserker" },
        { code: "totem", label: "Totem", linkedAssetId: OTHER },
      ],
    },
  ],
  resources: [
    {
      key: "rage",
      name: "Rage",
      maximumExpression: variable("scale.uses"),
      recovery: "LONG_REST",
    },
  ],
  scalingTracks: [
    {
      key: "uses",
      valueType: "INTEGER",
      scaleBy: "CLASS_LEVEL",
      values: [
        { minimumLevel: 1, value: 2 },
        { minimumLevel: 3, value: 3 },
      ],
    },
    {
      key: "martial",
      valueType: "DIE",
      scaleBy: "CHARACTER_LEVEL",
      values: [{ minimumLevel: 1, value: { count: 1, faces: 4 } }],
    },
  ],
  activations: [
    {
      key: "enter",
      activationType: "BONUS_ACTION",
      duration: { unit: "MINUTE", amount: constant(1) },
      costs: [{ costType: "RESOURCE", resourceKey: "rage", amountExpression: constant(1) }],
    },
  ],
  effects: [
    {
      key: "damage",
      activationKey: "enter",
      displayOrder: 0,
      condition: { type: "ABILITY", ability: "str", operator: "GTE", value: 13 },
      payload: { type: "MODIFIER", stat: "damage.melee", amount: variable("param.bonus") },
    },
    {
      key: "strike",
      displayOrder: 1,
      payload: { type: "DAMAGE", damageType: "bludgeoning", dice: { ref: "scale.martial" } },
    },
    {
      key: "resist",
      displayOrder: 2,
      payload: { type: "MODIFIER", stat: "uses", amount: variable("resource.rage.max") },
    },
  ],
  supersedes: [{ targetAssetId: OTHER, mode: "UPGRADE" }],
};

describe("feature definitions", () => {
  it("accepts a definition using every part and fills defaults", () => {
    const result = parse(rage);

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: "ACTIVE",
      stackingMode: "NONE",
      rulesetPolicy: "NEUTRAL",
      sections: [],
    });
    expect(result.data?.activations[0]).toMatchObject({ concentration: false, trigger: null });
    expect(result.data?.parameters[0]).toMatchObject({ required: false });
  });

  it("accepts a plain rule text", () => {
    expect(parse({ description: "Advantage on **Strength** checks." }).success).toBe(true);
  });

  it("requires unique keys per part and unique targets", () => {
    expect(
      messages({
        parameters: [
          { key: "x", valueType: "INTEGER" },
          { key: "x", valueType: "TEXT" },
        ],
        supersedes: [
          { targetAssetId: ASSET, mode: "UPGRADE" },
          { targetAssetId: ASSET, mode: "REPLACE" },
        ],
      }),
    ).toEqual([
      "Parameter keys must be unique",
      "Parameter keys must be unique",
      "Targets must be unique",
      "Targets must be unique",
    ]);
  });

  it("only allows known variables, and resources only in activations and effects", () => {
    expect(
      messages({
        parameters: [{ key: "name", valueType: "TEXT" }],
        resources: [
          {
            key: "a",
            name: "A",
            maximumExpression: variable("resource.a.max"),
            recovery: "NONE",
          },
        ],
        effects: [
          {
            key: "e",
            displayOrder: 0,
            payload: { type: "MODIFIER", stat: "ac", amount: variable("param.name") },
          },
          {
            key: "f",
            displayOrder: 1,
            condition: {
              type: "COMPARE",
              operator: "GT",
              left: variable("hp.current"),
              right: constant(0),
            },
            payload: { type: "MODIFIER", stat: "ac", amount: variable("level.character") },
          },
        ],
      }),
    ).toEqual([
      "Unknown variable 'resource.a.max'",
      "Unknown variable 'param.name'",
      "Unknown variable 'hp.current'",
    ]);
  });

  it("checks references between parts and dice references", () => {
    expect(
      messages({
        parameters: [{ key: "bonus", valueType: "INTEGER" }],
        activations: [
          {
            key: "use",
            activationType: "ACTION",
            costs: [{ costType: "RESOURCE", resourceKey: "missing", amountExpression: constant(1) }],
          },
        ],
        effects: [
          {
            key: "e",
            activationKey: "other",
            displayOrder: 0,
            payload: { type: "HEAL", dice: { ref: "param.bonus" } },
          },
        ],
      }),
    ).toEqual(["Unknown resource", "Unknown activation", "Unknown dice 'param.bonus'"]);
  });

  it("limits the depth and size of expressions", () => {
    let deep: Record<string, unknown> = constant(1);

    for (let depth = 0; depth < 20; depth += 1) {
      deep = { type: "ADD", args: [deep] };
    }

    expect(
      messages({
        effects: [{ key: "e", displayOrder: 0, payload: { type: "MODIFIER", stat: "ac", amount: deep } }],
      }),
    ).toEqual(["Expression depth limit exceeded (12)"]);

    const wide = { type: "ADD", args: Array.from({ length: 300 }, () => constant(1)) };

    expect(
      messages({
        effects: [{ key: "e", displayOrder: 0, payload: { type: "MODIFIER", stat: "ac", amount: wide } }],
      }),
    ).toEqual(["Expression node limit exceeded (256)"]);
  });

  it("checks typed values of parameters and scaling steps", () => {
    expect(
      messages({
        parameters: [
          { key: "a", valueType: "INTEGER", defaultValue: 1.5 },
          { key: "b", valueType: "DIE", defaultValue: { count: 1, faces: 7 } },
          { key: "c", valueType: "ASSET_REF", defaultValue: "nope" },
        ],
      }),
    ).toHaveLength(3);
    expect(
      messages({
        scalingTracks: [
          {
            key: "t",
            valueType: "INTEGER",
            scaleBy: "CHARACTER_LEVEL",
            values: [
              { minimumLevel: 5, value: 2 },
              { minimumLevel: 5, value: 3 },
              { minimumLevel: 3, value: "x" },
            ],
          },
        ],
      }),
    ).toEqual([
      "Scaling levels must be unique and ascending",
      "Scaling levels must be unique and ascending",
      expect.stringContaining("expected number"),
    ]);
  });

  it("checks choice bounds and options", () => {
    expect(
      messages({
        choices: [
          {
            key: "c",
            choiceType: "OPTION",
            minimumSelections: 3,
            maximumSelections: 2,
            displayOrder: 0,
            options: [
              { code: "a", label: "A" },
              { code: "a", label: "B" },
            ],
          },
          {
            key: "d",
            choiceType: "ASSET",
            minimumSelections: 1,
            maximumSelections: 1,
            displayOrder: 1,
          },
        ],
      }),
    ).toEqual([
      "The minimum cannot exceed the maximum",
      "A choice needs at least as many options as it requires",
      "Option codes must be unique",
      "A choice needs options or a filter",
      "A choice needs at least as many options as it requires",
    ]);
  });

  it("requires resource costs to name a resource and others not to", () => {
    expect(
      messages({
        activations: [
          {
            key: "a",
            activationType: "ACTION",
            costs: [
              { costType: "RESOURCE", amountExpression: constant(1) },
              { costType: "SPELL_SLOT", resourceKey: "slot", amountExpression: constant(1) },
            ],
          },
        ],
      }),
    ).toEqual([
      "Resource costs, and only they, name a resource",
      "Resource costs, and only they, name a resource",
      "Unknown resource",
    ]);
  });

  it("rejects fields the client may not set and empty updates", () => {
    expect(parse({ campaignId: ASSET }).success).toBe(false);
    expect(parse({ scope: "SYSTEM" }).success).toBe(false);
    expect(
      UpdateFeatureSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success,
    ).toBe(false);
    expect(
      UpdateFeatureSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, effects: [] })
        .success,
    ).toBe(true);
  });

  it("collects referenced assets with their place", () => {
    const result = parse(rage);

    expect(collectAssetReferences(result.data!)).toEqual([
      { assetId: OTHER, kind: "SUPERSEDES", path: ["supersedes", 0, "targetAssetId"] },
      { assetId: OTHER, kind: "CHOICE_OPTION", path: ["choices", 0, "options", 1, "linkedAssetId"] },
      { assetId: ASSET, kind: "PARAMETER_DEFAULT", path: ["parameters", 2, "defaultValue"] },
    ]);
  });

  it("reports nothing for valid graphs", () => {
    expect(validateFeatureDefinition(parse(rage).data!)).toEqual([]);
  });
});
