import { CreateClassSchema } from "#src/modules/classes/domain/dto/CreateClassDto";
import {
  type ClassDefinition,
  ClassDefinitionSchema,
  EquipmentEntrySchema,
  FeatureBindingSchema,
  FeatureGrantSchema,
  ProficiencyRuleSchema,
  ProgressionTrackSchema,
  SpellcastingProfileSchema,
  StartingEquipmentOptionSchema,
} from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import {
  collectClassReferences,
  validateClassDefinition,
} from "#src/modules/classes/domain/ClassDefinition";
import {
  getMulticlassRequirements,
  getProficiencyGrants,
  getProgression,
  meetsMulticlassRequirements,
} from "#src/modules/classes/domain/ClassViews";
import { toPlayerDefinition } from "#src/modules/classes/domain/dto/ResponseClassDto";

const RAGE = "11111111-1111-4111-8111-111111111111";
const RAGE_2 = "22222222-2222-4222-8222-222222222222";
const AXE = "33333333-3333-4333-8333-333333333333";
const PATH = "44444444-4444-4444-8444-444444444444";
const SPELLS = "55555555-5555-4555-8555-555555555555";

const levels = (count = 20, grants: Record<number, unknown[]> = {}) =>
  Array.from({ length: count }, (_, index) => ({
    level: index + 1,
    featureGrants: grants[index + 1] ?? [],
  }));

const subclassChoice = {
  key: "subclass",
  level: 3,
  choiceType: "SUBCLASS",
  minimumSelections: 1,
  maximumSelections: 1,
  optionFilter: { assetTypes: ["SUBCLASS"] },
  displayOrder: 0,
};

/** A choice whose option links a feature, e.g. a totem spirit. */
const totemChoice = {
  key: "totem",
  level: 3,
  choiceType: "FEATURE_OPTION",
  minimumSelections: 1,
  maximumSelections: 1,
  displayOrder: 1,
  options: [{ code: "bear", label: "Bear", linkedAssetId: PATH }],
};

/** A barbarian with every part used once. */
const barbarian = (): ClassDefinition =>
  ClassDefinitionSchema.parse({
    primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
    proficiencies: [
      {
        key: "saves",
        acquisitionMode: "STARTING_CLASS",
        proficiencyType: "SAVING_THROW",
        selectionMode: "FIXED",
        displayOrder: 0,
        options: [{ code: "str" }, { code: "con" }],
      },
      {
        key: "skills",
        acquisitionMode: "STARTING_CLASS",
        proficiencyType: "SKILL",
        selectionMode: "CHOOSE",
        choiceCount: 2,
        displayOrder: 1,
        options: [{ code: "athletics" }, { code: "intimidation" }, { code: "survival" }],
      },
      {
        key: "multiclass_armor",
        acquisitionMode: "MULTICLASS",
        proficiencyType: "ARMOR",
        selectionMode: "FIXED",
        displayOrder: 2,
        options: [{ code: "shield" }],
      },
    ],
    startingEquipment: [
      {
        code: "kit",
        name: "Greataxe kit",
        optionType: "EQUIPMENT",
        displayOrder: 0,
        entries: [
          { entryType: "FIXED_ITEM", itemAssetId: AXE },
          { entryType: "ITEM_CHOICE", choiceCount: 1, typedFilter: { categories: ["simple-weapon"] } },
        ],
      },
      { code: "gold", name: "Gold", optionType: "CURRENCY", currencyAmount: 75, currencyCode: "GP", displayOrder: 1 },
    ],
    progressionTracks: [
      {
        key: "rages",
        label: "Rages",
        valueType: "INTEGER",
        displayOrder: 0,
        values: [
          { level: 1, value: 2 },
          { level: 3, value: 3 },
        ],
      },
      { key: "rage_damage", label: "Rage Damage", valueType: "BONUS", displayOrder: 1, values: [{ level: 1, value: 2 }] },
    ],
    levels: levels(20, {
      1: [
        {
          key: "rage",
          featureAssetId: RAGE,
          grantOperation: "GRANT",
          displayOrder: 0,
          bindings: [
            { parameterKey: "uses", bindingSource: "PROGRESSION_TRACK", trackKey: "rages" },
            { parameterKey: "bonus", bindingSource: "CONTEXT", contextKey: "level.class" },
          ],
        },
      ],
      9: [
        {
          key: "brutal",
          featureAssetId: RAGE_2,
          grantOperation: "UPGRADE",
          targetFeatureAssetId: RAGE,
          displayOrder: 0,
        },
      ],
    }),
    choices: [subclassChoice, totemChoice],
    spellcasting: null,
    multiclass: { combinationMode: "ALL", abilityRequirements: [{ ability: "str", minimum: 13 }] },
  });

const settings = { maximumLevel: 20, subclassSelectionLevel: 3 };
const messages = (definition: ClassDefinition, overrides: Partial<typeof settings> = {}) =>
  validateClassDefinition({ ...settings, ...overrides }, definition).map((issue) => issue.message);

describe("class definitions", () => {
  it("accepts a complete definition", () => {
    expect(messages(barbarian())).toEqual([]);
  });

  it("needs one level entry per level, in order", () => {
    const definition = barbarian();

    expect(messages({ ...definition, levels: definition.levels.slice(0, 19) })).toContain(
      "Levels must be 1 to 20, each once and in order",
    );
    expect(messages({ ...definition, levels: [...definition.levels].reverse() })).toContain(
      "Levels must be 1 to 20, each once and in order",
    );
    expect(messages(definition, { maximumLevel: 19 })).toContain(
      "Levels must be 1 to 19, each once and in order",
    );
  });

  it("needs exactly one subclass choice at the selection level", () => {
    const definition = barbarian();

    expect(messages({ ...definition, choices: [] })).toContain("A class needs exactly one subclass choice");
    expect(messages(definition, { subclassSelectionLevel: 1 })).toContain(
      "The subclass choice is made at the subclass selection level",
    );
    expect(
      messages({ ...definition, choices: [{ ...definition.choices[0]!, maximumSelections: 2 }] }),
    ).toContain("Exactly one subclass is chosen");
  });

  it("checks keys and references between parts", () => {
    const definition = barbarian();
    const grant = definition.levels[0]!.featureGrants[0]!;
    const broken: ClassDefinition = {
      ...definition,
      levels: definition.levels.map((entry) =>
        entry.level === 2
          ? {
              ...entry,
              featureGrants: [
                {
                  ...grant,
                  choiceKey: "missing",
                  bindings: [
                    { parameterKey: "a", bindingSource: "PROGRESSION_TRACK", trackKey: "nope", staticValue: null, choiceKey: null, contextKey: null },
                    { parameterKey: "b", bindingSource: "CONTEXT", contextKey: "hp", staticValue: null, choiceKey: null, trackKey: null },
                    { parameterKey: "c", bindingSource: "CLASS_CHOICE", choiceKey: "gone", staticValue: null, trackKey: null, contextKey: null },
                  ],
                },
              ],
            }
          : entry,
      ),
      choices: [
        ...definition.choices,
        { ...definition.choices[0]!, key: "style", choiceType: "FEATURE_OPTION", grantKey: "unknown", level: 4, optionFilter: { assetTypes: ["FEATURE"] }, options: [] },
      ],
    };

    expect(messages(broken)).toEqual(
      expect.arrayContaining([
        "Key 'rage' is used more than once",
        "Unknown choice 'missing'",
        "Unknown progression track 'nope'",
        "Unknown context value 'hp'",
        "Unknown choice 'gone'",
        "Unknown feature grant 'unknown'",
      ]),
    );
  });

  it("keeps values, choices and spellcasting within the maximum level", () => {
    const definition = barbarian();

    expect(
      messages(
        { ...definition, levels: definition.levels.slice(0, 10) },
        { maximumLevel: 10 },
      ),
    ).toEqual([]);
    expect(
      messages(
        {
          ...definition,
          levels: definition.levels.slice(0, 2),
          progressionTracks: definition.progressionTracks,
        },
        { maximumLevel: 2, subclassSelectionLevel: 2 },
      ),
    ).toEqual(expect.arrayContaining(["Level is above the maximum level", "The subclass choice is made at the subclass selection level"]));
  });

  it("validates the parts on their own", () => {
    expect(
      ProficiencyRuleSchema.safeParse({
        key: "skills",
        acquisitionMode: "STARTING_CLASS",
        proficiencyType: "SKILL",
        selectionMode: "CHOOSE",
        choiceCount: 4,
        displayOrder: 0,
        options: [{ code: "athletics" }],
      }).success,
    ).toBe(false);
    expect(
      ProficiencyRuleSchema.safeParse({
        key: "tools",
        acquisitionMode: "STARTING_CLASS",
        proficiencyType: "TOOL",
        selectionMode: "FIXED",
        displayOrder: 0,
        options: [{ code: "thieves-tools", assetId: AXE }],
      }).success,
    ).toBe(false);
    expect(EquipmentEntrySchema.safeParse({ entryType: "FIXED_ITEM" }).success).toBe(false);
    expect(EquipmentEntrySchema.safeParse({ entryType: "ITEM_CHOICE", itemAssetId: AXE }).success).toBe(false);
    expect(
      StartingEquipmentOptionSchema.safeParse({ code: "gold", name: "Gold", optionType: "CURRENCY", displayOrder: 0 }).success,
    ).toBe(false);
    expect(
      ProgressionTrackSchema.safeParse({
        key: "die",
        label: "Martial Arts",
        valueType: "DIE",
        displayOrder: 0,
        values: [{ level: 1, value: 6 }],
      }).success,
    ).toBe(false);
    expect(
      ProgressionTrackSchema.safeParse({
        key: "die",
        label: "Martial Arts",
        valueType: "DIE",
        displayOrder: 0,
        values: [{ level: 1, value: { count: 1, faces: 6 } }],
      }).success,
    ).toBe(true);
    expect(
      FeatureBindingSchema.safeParse({ parameterKey: "uses", bindingSource: "STATIC", trackKey: "rages" }).success,
    ).toBe(false);
    expect(
      FeatureGrantSchema.safeParse({ key: "x", featureAssetId: RAGE, grantOperation: "REPLACE", displayOrder: 0 }).success,
    ).toBe(false);
  });

  it("keeps spellcasting profiles consistent", () => {
    const wizard = {
      castingType: "FULL",
      spellcastingAbility: "int",
      unlockLevel: 1,
      preparationMode: "SPELLBOOK",
      spellListAssetId: SPELLS,
      ritualMode: "SPELLBOOK",
      multiclassNumerator: 1,
      multiclassDenominator: 1,
      multiclassRounding: "NONE",
      levels: [{ level: 1, cantripsKnown: 3, preparedSpells: 4, spellSlots: [2] }],
    };

    expect(SpellcastingProfileSchema.safeParse(wizard).success).toBe(true);
    expect(SpellcastingProfileSchema.safeParse({ ...wizard, spellcastingAbility: null }).success).toBe(false);
    expect(SpellcastingProfileSchema.safeParse({ ...wizard, multiclassNumerator: null }).success).toBe(false);
    expect(
      SpellcastingProfileSchema.safeParse({ ...wizard, levels: [{ level: 1, pactSlots: 1, pactSlotLevel: 1 }] }).success,
    ).toBe(false);
    expect(
      SpellcastingProfileSchema.safeParse({
        ...wizard,
        castingType: "PACT",
        multiclassNumerator: null,
        multiclassDenominator: null,
        multiclassRounding: null,
        levels: [{ level: 1, pactSlots: 1, pactSlotLevel: 1 }],
      }).success,
    ).toBe(true);
    expect(
      SpellcastingProfileSchema.safeParse({ castingType: "NONE", preparationMode: "NONE", spellcastingAbility: "int" }).success,
    ).toBe(false);
    expect(
      SpellcastingProfileSchema.safeParse({ ...wizard, unlockLevel: 2 }).success,
    ).toBe(false);
  });

  it("restricts what choices may offer by their type", () => {
    const definition = barbarian();
    const parsed = ClassDefinitionSchema.safeParse({
      ...definition,
      choices: [
        ...definition.choices,
        { ...subclassChoice, key: "skill", choiceType: "SKILL_PROFICIENCY", level: null, optionFilter: { assetTypes: ["ITEM"] } },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("takes the options of the subclass choice from the subclasses, not from the class", () => {
    const parsed = ClassDefinitionSchema.safeParse({
      ...barbarian(),
      choices: [{ ...subclassChoice, options: [{ code: "berserker", label: "Berserker", linkedAssetId: PATH }] }],
    });

    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain(
      "Subclass choices take their options from the subclasses of the class",
    );
  });

  it("fills missing levels on create and validates the result", () => {
    const parsed = CreateClassSchema.safeParse({
      name: "Barbarian",
      hitDie: "D12",
      firstLevelHitPoints: 12,
      fixedHitPointsPerLevel: 7,
      subclassSelectionLevel: 3,
      primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
      choices: [subclassChoice],
    });

    expect(parsed.success).toBe(true);
    expect(
      CreateClassSchema.safeParse({
        name: "Barbarian",
        hitDie: "D12",
        firstLevelHitPoints: 12,
        fixedHitPointsPerLevel: 7,
        subclassSelectionLevel: 3,
        primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
      }).success,
    ).toBe(false);
  });

  it("collects every asset reference with the allowed types", () => {
    const references = collectClassReferences(barbarian());

    expect(references.map((reference) => [reference.assetId, reference.assetTypes])).toEqual(
      expect.arrayContaining([
        [AXE, ["ITEM"]],
        [RAGE, ["FEATURE"]],
        [RAGE_2, ["FEATURE"]],
        [PATH, ["FEATURE"]],
      ]),
    );
    expect(references).toHaveLength(5);
  });
});

describe("class views", () => {
  it("builds the class table with one row per level", () => {
    const progression = getProgression({ maximumLevel: 20, hitDie: "D12", firstLevelHitPoints: 12, fixedHitPointsPerLevel: 7, subclassSelectionLevel: 3 }, barbarian());

    expect(progression.levels).toHaveLength(20);
    expect(progression.levels[0]).toEqual({
      level: 1,
      values: [
        { trackKey: "rages", value: 2 },
        { trackKey: "rage_damage", value: 2 },
      ],
      featureGrantKeys: ["rage"],
      choiceKeys: [],
    });
    expect(progression.levels[2]?.choiceKeys).toEqual(["subclass", "totem"]);
    expect(progression.levels[1]?.values[0]).toEqual({ trackKey: "rages", value: null });
  });

  it("splits proficiencies and checks multiclass requirements", () => {
    const definition = barbarian();

    expect(getProficiencyGrants(definition).startingClass.map((rule) => rule.key)).toEqual(["saves", "skills"]);
    expect(getMulticlassRequirements(definition).proficiencies.map((rule) => rule.key)).toEqual(["multiclass_armor"]);
    expect(meetsMulticlassRequirements(definition, { str: 13 })).toBe(true);
    expect(meetsMulticlassRequirements(definition, { str: 12, dex: 18 })).toBe(false);
    expect(
      meetsMulticlassRequirements(
        { multiclass: { combinationMode: "ANY", abilityRequirements: [{ ability: "str", minimum: 13 }, { ability: "dex", minimum: 13 }] } },
        { dex: 13 },
      ),
    ).toBe(true);
  });

  it("hides references to assets a player may not see", () => {
    const view = toPlayerDefinition(barbarian(), (assetId) => assetId !== RAGE_2 && assetId !== AXE && assetId !== PATH);

    expect(view.levels[8]?.featureGrants).toEqual([]);
    expect(view.levels[0]?.featureGrants).toHaveLength(1);
    expect(view.startingEquipment[0]?.entries[0]?.itemAssetId).toBeNull();
    // A hidden option is left out with its label, not only its link.
    expect(view.choices.find((choice) => choice.key === "totem")?.options).toEqual([]);
  });

  it("leaves out what depends on a hidden grant for players", () => {
    const base = barbarian();
    const definition = ClassDefinitionSchema.parse({
      ...base,
      levels: levels(20, {
        1: base.levels[0]?.featureGrants ?? [],
        // The hidden upgrade asks for a style; the style selects a grant that binds the choice.
        9: [
          ...(base.levels[8]?.featureGrants ?? []),
          {
            key: "style_feature",
            featureAssetId: RAGE,
            grantOperation: "GRANT",
            choiceKey: "style",
            displayOrder: 1,
          },
        ],
        10: [
          {
            key: "other",
            featureAssetId: RAGE,
            grantOperation: "GRANT",
            displayOrder: 0,
            bindings: [{ parameterKey: "pick", bindingSource: "CLASS_CHOICE", choiceKey: "style" }],
          },
        ],
      }),
      choices: [
        ...base.choices,
        {
          ...subclassChoice,
          key: "style",
          choiceType: "FEATURE_OPTION",
          grantKey: "brutal",
          level: 9,
          optionFilter: { assetTypes: ["FEATURE"] },
          options: [],
        },
      ],
    });
    const view = toPlayerDefinition(definition, (assetId) => assetId !== RAGE_2);

    expect(view.choices.map((choice) => choice.key)).toEqual(["subclass", "totem"]);
    expect(view.levels[8]?.featureGrants).toEqual([]);
    expect(view.levels[9]?.featureGrants[0]?.bindings).toEqual([]);
  });
});
