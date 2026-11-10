import { CreateSubclassSchema } from "#src/modules/subclasses/domain/dto/CreateSubclassDto";
import {
  type SubclassDefinition,
  SubclassDefinitionSchema,
} from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import { UpdateSubclassSchema } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import {
  collectSubclassReferences,
  type SubclassClassContext,
  validateSubclassAgainstClass,
  validateSubclassDefinition,
} from "#src/modules/subclasses/domain/SubclassDefinition";
import {
  getChoices,
  getProgression,
  getSpellcasting,
  grantKeysUpTo,
  toPlayerSubclassDefinition,
} from "#src/modules/subclasses/domain/SubclassViews";

const CLASS_ID = "00000000-0000-4000-8000-000000000001";
const RAGE = "11111111-1111-4111-8111-111111111111";
const FRENZY = "22222222-2222-4222-8222-222222222222";
const RETALIATION = "33333333-3333-4333-8333-333333333333";
const TOTEM = "44444444-4444-4444-8444-444444444444";
const BLESS = "55555555-5555-4555-8555-555555555555";
const WIZARD_LIST = "66666666-6666-4666-8666-666666666666";

const grant = (key: string, featureAssetId: string, extra: Record<string, unknown> = {}) => ({
  key,
  featureAssetId,
  grantOperation: "GRANT",
  displayOrder: 0,
  ...extra,
});

/** A Berserker with every part used once. */
const berserker = (overrides: Record<string, unknown> = {}): SubclassDefinition =>
  SubclassDefinitionSchema.parse({
    levels: [
      {
        level: 3,
        featureGrants: [
          grant("frenzy", FRENZY, {
            bindings: [{ parameterKey: "dice", bindingSource: "PROGRESSION_TRACK", trackKey: "frenzy_dice" }],
          }),
        ],
      },
      { level: 6, featureGrants: [grant("totem_gift", TOTEM, { choiceKey: "totem" })] },
      {
        level: 14,
        featureGrants: [
          grant("retaliation", RETALIATION, { grantOperation: "UPGRADE", targetFeatureAssetId: FRENZY }),
        ],
      },
    ],
    progressionTracks: [
      { key: "frenzy_dice", label: "Frenzy", valueType: "INTEGER", displayOrder: 0, values: [{ level: 3, value: 2 }] },
    ],
    choices: [
      {
        key: "totem",
        level: 6,
        grantKey: "totem_gift",
        choiceType: "FEATURE_OPTION",
        minimumSelections: 1,
        maximumSelections: 1,
        displayOrder: 0,
        options: [{ code: "bear", label: "Bear", linkedAssetId: TOTEM }],
      },
    ],
    spellcasting: null,
    spellGrants: [],
    ...overrides,
  });

/** A barbarian of 2024: subclass at 3, Rage at 1, no spellcasting. */
const barbarian2024: SubclassClassContext = {
  maximumLevel: 20,
  subclassSelectionLevel: 3,
  definition: {
    levels: Array.from({ length: 20 }, (_, index) => ({
      level: index + 1,
      featureGrants:
        index === 0
          ? [{ key: "rage", featureAssetId: RAGE, grantOperation: "GRANT", targetFeatureAssetId: null, isRequired: true, choiceKey: null, displayOrder: 0, bindings: [] }]
          : [],
    })),
    spellcasting: null,
  },
};

const cleric2014 = (spellcasting: SubclassClassContext["definition"]["spellcasting"] = null): SubclassClassContext => ({
  ...barbarian2024,
  subclassSelectionLevel: 1,
  definition: { ...barbarian2024.definition, spellcasting },
});

const casterProfile = {
  castingType: "FULL" as const,
  spellcastingAbility: "wis" as const,
  unlockLevel: 1,
  preparationMode: "PREPARED" as const,
  spellListAssetId: null,
  ritualMode: "PREPARED" as const,
  multiclassNumerator: 1,
  multiclassDenominator: 1,
  multiclassRounding: "DOWN" as const,
  levels: [],
};

const messages = (definition: SubclassDefinition) =>
  validateSubclassDefinition(definition).map((issue) => issue.message);
const classMessages = (base: SubclassClassContext, definition: SubclassDefinition) =>
  validateSubclassAgainstClass(base, definition).map((issue) => issue.message);

describe("subclass definitions", () => {
  it("accepts a complete definition", () => {
    expect(messages(berserker())).toEqual([]);
    expect(classMessages(barbarian2024, berserker())).toEqual([]);
  });

  it("checks keys and references between parts", () => {
    const definition = berserker();

    expect(
      messages({
        ...definition,
        levels: [
          ...definition.levels,
          { level: 10, featureGrants: [{ ...definition.levels[0]!.featureGrants[0]!, choiceKey: "unknown" }] },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "Key 'frenzy' is used more than once",
        "Unknown choice 'unknown'",
      ]),
    );
    expect(
      messages({
        ...definition,
        levels: [
          {
            level: 3,
            featureGrants: [
              {
                ...definition.levels[0]!.featureGrants[0]!,
                bindings: [{ parameterKey: "dice", bindingSource: "PROGRESSION_TRACK", staticValue: null, choiceKey: null, trackKey: "nope", contextKey: null }],
              },
            ],
          },
        ],
        choices: [],
      }),
    ).toEqual(["Unknown progression track 'nope'"]);
    expect(messages({ ...definition, levels: [...definition.levels].reverse() })).toContain(
      "Levels must be unique and ascending",
    );
  });

  it("has no subclass choice of its own and keeps choices of grants at their level", () => {
    const definition = berserker();
    const [totem] = definition.choices;

    expect(
      messages({ ...definition, choices: [{ ...totem!, choiceType: "SUBCLASS", optionFilter: { assetTypes: ["SUBCLASS"] }, options: [] }] }),
    ).toContain("A subclass has no subclass choice of its own");
    expect(messages({ ...definition, choices: [{ ...totem!, level: 3 }] })).toContain(
      "A choice of a grant is made at the level of the grant",
    );
  });

  it("validates the create DTO with the rules across parts", () => {
    const valid = CreateSubclassSchema.safeParse({ name: "Path of the Berserker", classId: CLASS_ID, ...berserker() });

    expect(valid.success).toBe(true);
    expect(valid.data?.code).toBeUndefined();
    expect(valid.data?.rulesetPolicy).toBeUndefined();

    const invalid = CreateSubclassSchema.safeParse({
      name: "Broken",
      classId: CLASS_ID,
      choices: berserker().choices,
    });

    expect(invalid.success).toBe(false);
    expect(JSON.stringify(invalid.error?.issues)).toContain("Unknown feature grant 'totem_gift'");
    expect(CreateSubclassSchema.safeParse({ name: "No class" }).success).toBe(false);
    expect(CreateSubclassSchema.safeParse({ name: "Bad code", classId: CLASS_ID, code: "Bad Code" }).success).toBe(false);
  });

  it("takes no class in updates and needs at least one field", () => {
    expect(UpdateSubclassSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(
      UpdateSubclassSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, classId: CLASS_ID }).success,
    ).toBe(false);
    expect(
      UpdateSubclassSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, name: "Zealot" }).success,
    ).toBe(true);
  });

  it("keeps spellcasting profiles consistent", () => {
    const parse = (profile: Record<string, unknown>) =>
      SubclassDefinitionSchema.safeParse({ ...berserker(), spellcasting: { ...casterProfile, ...profile } }).success;

    expect(parse({ castingType: "THIRD", multiclassDenominator: 3, unlockLevel: 3 })).toBe(true);
    expect(parse({ multiclassNumerator: null, multiclassDenominator: null, multiclassRounding: null })).toBe(false);
    expect(parse({ castingType: "PACT" })).toBe(false);
    expect(parse({ preparationMode: "NONE" })).toBe(false);
    expect(parse({ unlockLevel: 3, levels: [{ level: 2, spellSlots: [2] }] })).toBe(false);
    expect(parse({ levels: [{ level: 3, pactSlots: 1, pactSlotLevel: 1 }] })).toBe(false);
  });
});

describe("subclasses against their class", () => {
  it("follows the selection level of the class: 2024 at 3, a 2014 cleric at 1", () => {
    const domain = berserker({ levels: [{ level: 1, featureGrants: [grant("blessed", FRENZY)] }], choices: [], progressionTracks: [] });

    expect(classMessages(cleric2014(), domain)).toEqual([]);
    expect(classMessages(barbarian2024, domain)).toEqual([
      "Level must be between the subclass selection level 3 and the maximum level 20 of the class",
    ]);
    expect(
      classMessages({ ...barbarian2024, maximumLevel: 10 }, berserker()),
    ).toContain("Level must be between the subclass selection level 3 and the maximum level 10 of the class");
  });

  it("upgrades and replaces only what the class or the subclass grants by then", () => {
    const upgradeRage = (level: number, operation = "UPGRADE") =>
      berserker({
        levels: [{ level, featureGrants: [grant("mighty", FRENZY, { grantOperation: operation, targetFeatureAssetId: RAGE })] }],
        choices: [],
        progressionTracks: [],
      });

    // Rage comes from the class at level 1.
    expect(classMessages(barbarian2024, upgradeRage(3))).toEqual([]);
    expect(classMessages(barbarian2024, upgradeRage(5, "REPLACE"))).toEqual([]);

    // The class doesn't grant it: neither does the subclass, so there is nothing to upgrade.
    const noRage = { ...barbarian2024, definition: { ...barbarian2024.definition, levels: [] } };

    expect(classMessages(noRage, upgradeRage(3))).toEqual([
      "The class or subclass must grant the target feature at or before this level",
    ]);

    // An upgrade of the subclass's own feature before it is granted.
    const early = berserker();

    expect(
      classMessages(
        barbarian2024,
        berserker({
          choices: early.choices,
          levels: [
            { level: 3, featureGrants: [grant("retaliation", RETALIATION, { grantOperation: "UPGRADE", targetFeatureAssetId: FRENZY })] },
            { level: 6, featureGrants: [grant("frenzy", FRENZY), grant("totem_gift", TOTEM, { choiceKey: "totem" })] },
          ],
        }),
      ),
    ).toContain("The class or subclass must grant the target feature at or before this level");
  });

  it("brings spellcasting only to classes without and needs a caster for granted spells", () => {
    const blessGrant = { key: "bless", level: 1, spellAssetId: BLESS, mode: "ALWAYS_PREPARED", displayOrder: 0 };
    const domain = berserker({ levels: [], choices: [], progressionTracks: [], spellGrants: [blessGrant] });

    expect(classMessages(cleric2014(casterProfile), domain)).toEqual([]);
    expect(classMessages(cleric2014(), domain)).toEqual([
      "Granted spells need spellcasting of the class or the subclass",
    ]);

    const knight = berserker({
      spellcasting: { ...casterProfile, castingType: "THIRD", multiclassDenominator: 3, unlockLevel: 3, spellListAssetId: WIZARD_LIST },
    });

    expect(classMessages(barbarian2024, knight)).toEqual([]);
    expect(classMessages(cleric2014(casterProfile), knight)).toEqual([
      "The class casts spells itself; the subclass cannot add its own spellcasting",
    ]);
    expect(
      classMessages(barbarian2024, { ...knight, spellcasting: { ...knight.spellcasting!, unlockLevel: 1, levels: [] } }),
    ).toContain("Level must be between the subclass selection level 3 and the maximum level 20 of the class");
  });

  it("collects every asset reference with the allowed types", () => {
    const definition = berserker({
      spellGrants: [{ key: "bless", level: 3, spellAssetId: BLESS, mode: "ADDED_TO_LIST", displayOrder: 0 }],
      spellcasting: { ...casterProfile, spellListAssetId: WIZARD_LIST },
    });

    expect(collectSubclassReferences(definition).map((item) => [item.assetId, item.assetTypes])).toEqual([
      [FRENZY, ["FEATURE"]],
      [TOTEM, ["FEATURE"]],
      [RETALIATION, ["FEATURE"]],
      [FRENZY, ["FEATURE"]],
      [TOTEM, ["FEATURE"]],
      [BLESS, ["SPELL"]],
      [WIZARD_LIST, ["SPELL_LIST"]],
    ]);
  });
});

describe("subclass views", () => {
  const base = { classAssetId: CLASS_ID, selectionLevel: 3, maximumLevel: 20 };

  it("builds the subclass columns from the selection level to the maximum", () => {
    const definition = berserker({
      spellGrants: [{ key: "bless", level: 3, spellAssetId: BLESS, mode: "ALWAYS_PREPARED", displayOrder: 0 }],
    });
    const progression = getProgression(base, definition);

    expect(progression.levels.map((entry) => entry.level)).toEqual(Array.from({ length: 18 }, (_, index) => index + 3));
    expect(progression.levels[0]).toEqual({
      level: 3,
      values: [{ trackKey: "frenzy_dice", value: 2 }],
      featureGrantKeys: ["frenzy"],
      choiceKeys: [],
      spellGrantKeys: ["bless"],
    });
    expect(progression.levels[3]?.choiceKeys).toEqual(["totem"]);
    expect(getChoices(base, { choices: [{ ...definition.choices[0]!, level: null }] }).choices[0]?.key).toBe("totem");
    expect(getSpellcasting(definition).spellGrants.map((item) => item.key)).toEqual(["bless"]);
    expect(grantKeysUpTo(definition, 6)).toEqual(["frenzy", "totem_gift"]);
  });

  it("hides references to assets a player may not see", () => {
    const definition = berserker({
      spellGrants: [{ key: "bless", level: 3, spellAssetId: BLESS, mode: "ALWAYS_PREPARED", displayOrder: 0 }],
      spellcasting: { ...casterProfile, spellListAssetId: WIZARD_LIST },
    });
    const view = toPlayerSubclassDefinition(
      definition,
      (assetId) => assetId !== TOTEM && assetId !== BLESS && assetId !== WIZARD_LIST,
    );

    // The hidden totem grant takes its choice along.
    expect(view.levels.flatMap((entry) => entry.featureGrants.map((item) => item.key))).toEqual([
      "frenzy",
      "retaliation",
    ]);
    expect(view.choices).toEqual([]);
    expect(view.spellGrants).toEqual([]);
    expect(view.spellcasting?.spellListAssetId).toBeNull();
  });
});
