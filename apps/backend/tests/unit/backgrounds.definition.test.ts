import {
  collectRuleReferences,
  toPlayerDefinition,
  validateBackgroundDefinition,
  validateBackgroundEdition,
} from "#src/modules/backgrounds/domain/BackgroundDefinition";
import {
  canTakeFeatAgain,
  validateBackgroundSelection,
} from "#src/modules/backgrounds/domain/BackgroundSelection";
import {
  AbilityRuleSchema,
  type BackgroundDefinition,
  BackgroundDefinitionSchema,
  EquipmentOptionSchema,
  PromptTableSchema,
  ProficiencyGrantSchema,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import { CreateBackgroundSchema } from "#src/modules/backgrounds/domain/dto/CreateBackgroundDto";
import { ResolveBackgroundSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import { UpdateBackgroundSchema } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";

const FEAT_ID = "10000000-0000-4000-8000-000000000001";
const FEATURE_ID = "10000000-0000-4000-8000-000000000002";
const TOOL_ID = "10000000-0000-4000-8000-000000000003";
const ITEM_ID = "10000000-0000-4000-8000-000000000004";
const HIDDEN_ID = "10000000-0000-4000-8000-000000000005";

const definition = (parts: Record<string, unknown> = {}): BackgroundDefinition =>
  BackgroundDefinitionSchema.parse({
    sections: [],
    abilityRule: { mode: "NONE" },
    proficiencyGrants: [],
    featGrants: [],
    featureGrants: [],
    equipmentOptions: [],
    promptTables: [],
    ...parts,
  });

/** 2024 Acolyte: +3 over INT/WIS/CHA, Magic Initiate, two skills, a tool, two equipment packages. */
const ACOLYTE_2024 = {
  abilityRule: { mode: "CHOOSE_2024", allowedAbilities: ["int", "wis", "cha"] },
  proficiencyGrants: [
    {
      key: "skills",
      type: "SKILL",
      selectionMode: "FIXED",
      options: [{ code: "insight" }, { code: "religion" }],
    },
    { key: "tool", type: "TOOL", selectionMode: "FIXED", options: [{ assetId: TOOL_ID }] },
  ],
  featGrants: [{ key: "origin_feat", selectionMode: "FIXED", featAssetId: FEAT_ID }],
  equipmentOptions: [
    {
      code: "a",
      name: "Gear",
      optionType: "MIXED",
      currency: { GP: 8 },
      entries: [
        { key: "tool", itemAssetId: TOOL_ID },
        { key: "book", choiceFilter: { categories: ["ADVENTURING_GEAR"] } },
      ],
    },
    { code: "b", name: "Coins", optionType: "CURRENCY", currency: { GP: 50 } },
  ],
};

/** 2014 Sage: two languages of choice, customizable, prompts with a d8 table. */
const SAGE_2014 = {
  proficiencyGrants: [
    { key: "skills", type: "SKILL", selectionMode: "FIXED", options: [{ code: "arcana" }, { code: "history" }] },
    { key: "languages", type: "LANGUAGE", selectionMode: "CHOOSE", choiceCount: 2 },
  ],
  featureGrants: [{ key: "researcher", featureAssetId: FEATURE_ID }],
  promptTables: [
    {
      key: "ideal",
      promptType: "IDEAL",
      title: "Ideal",
      rollDie: 4,
      options: [
        { rollMin: 1, rollMax: 2, text: "Knowledge." },
        { rollMin: 3, rollMax: 4, text: "Beauty." },
      ],
    },
    { key: "bond", promptType: "BOND", title: "Bond", options: [{ text: "My library." }] },
  ],
};

const resolve = (body: Record<string, unknown> = {}) => ResolveBackgroundSchema.parse(body);

describe("background definition schemas", () => {
  it("accepts a 2024 and a 2014 background", () => {
    expect(() => definition(ACOLYTE_2024)).not.toThrow();
    expect(() => definition(SAGE_2014)).not.toThrow();
  });

  it("holds the 2024 ability rule to three distinct abilities, +3 and at most +2", () => {
    expect(AbilityRuleSchema.safeParse({ mode: "CHOOSE_2024", allowedAbilities: ["str", "dex"] }).success).toBe(false);
    expect(AbilityRuleSchema.safeParse({ mode: "CHOOSE_2024", allowedAbilities: ["str", "str", "dex"] }).success).toBe(
      false,
    );
    expect(
      AbilityRuleSchema.safeParse({ mode: "CHOOSE_2024", allowedAbilities: ["str", "dex", "con"], totalIncrease: 4 })
        .success,
    ).toBe(false);
    expect(AbilityRuleSchema.parse({ mode: "CHOOSE_2024", allowedAbilities: ["str", "dex", "con"] })).toEqual({
      mode: "CHOOSE_2024",
      allowedAbilities: ["str", "dex", "con"],
      totalIncrease: 3,
      maximumPerAbility: 2,
    });
    expect(AbilityRuleSchema.safeParse({ mode: "FIXED", increases: [] }).success).toBe(false);
  });

  it("checks proficiency grants by selection mode and type", () => {
    expect(ProficiencyGrantSchema.safeParse({ key: "a", type: "SKILL", selectionMode: "FIXED" }).success).toBe(false);
    expect(
      ProficiencyGrantSchema.safeParse({ key: "a", type: "SKILL", selectionMode: "CHOOSE", options: [{ code: "x" }] })
        .success,
    ).toBe(false);
    expect(
      ProficiencyGrantSchema.safeParse({
        key: "a",
        type: "SKILL",
        selectionMode: "FIXED",
        options: [{ assetId: TOOL_ID }],
      }).success,
    ).toBe(false);
    expect(
      ProficiencyGrantSchema.safeParse({
        key: "a",
        type: "TOOL",
        selectionMode: "CHOOSE",
        choiceCount: 3,
        options: [{ code: "lute" }, { code: "drum" }],
      }).success,
    ).toBe(false);
  });

  it("checks equipment options and prompt tables", () => {
    expect(EquipmentOptionSchema.safeParse({ code: "a", name: "A", optionType: "CURRENCY" }).success).toBe(false);
    expect(
      EquipmentOptionSchema.safeParse({
        code: "a",
        name: "A",
        optionType: "EQUIPMENT",
        entries: [{ key: "x", itemAssetId: ITEM_ID, choiceFilter: { categories: ["TOOL"] } }],
      }).success,
    ).toBe(false);

    const table = (options: unknown[]) =>
      PromptTableSchema.safeParse({ key: "t", promptType: "FLAW", title: "Flaw", rollDie: 4, options });

    expect(table([{ rollMin: 1, rollMax: 4, text: "x" }]).success).toBe(true);
    expect(table([{ rollMin: 1, rollMax: 3, text: "x" }]).success).toBe(false);
    expect(table([{ rollMin: 1, rollMax: 3, text: "x" }, { rollMin: 3, rollMax: 4, text: "y" }]).success).toBe(false);
    expect(table([{ rollMin: 1, rollMax: 6, text: "x" }]).success).toBe(false);
  });

  it("refuses repeated keys across grants, and Create/Update DTO rules", () => {
    expect(
      validateBackgroundDefinition(
        definition({
          ...SAGE_2014,
          featGrants: [{ key: "skills", selectionMode: "FIXED", featAssetId: FEAT_ID }],
        }),
      ),
    ).toEqual([{ path: ["proficiencyGrants"], message: "Grant key 'skills' is used more than once" }]);
    expect(CreateBackgroundSchema.safeParse({ name: "Sage", ...SAGE_2014 }).success).toBe(true);
    expect(CreateBackgroundSchema.safeParse({}).success).toBe(false);
    expect(UpdateBackgroundSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(UpdateBackgroundSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, code: "x" }).success).toBe(true);
  });
});

describe("background edition rules", () => {
  it("keeps CHOOSE_2024 to 2024 rulesets and requires it there", () => {
    const acolyte = definition(ACOLYTE_2024);

    expect(
      validateBackgroundEdition({ customizationMode: "FIXED", definition: acolyte }, [2014]),
    ).toEqual([expect.objectContaining({ path: ["abilityRule", "mode"] })]);
    expect(
      validateBackgroundEdition({ customizationMode: "FIXED", definition: definition() }, [2024]),
    ).toEqual([expect.objectContaining({ path: ["abilityRule", "mode"] })]);
    expect(
      validateBackgroundEdition({ customizationMode: "FIXED", definition: acolyte }, [2024]),
    ).toEqual([]);
  });

  it("allows the customization only before 2024 and asks for origin feats from 2024 on", () => {
    expect(
      validateBackgroundEdition(
        { customizationMode: "RULESET_CUSTOMIZABLE", definition: definition(SAGE_2014) },
        [2014],
      ),
    ).toEqual([]);
    expect(
      validateBackgroundEdition(
        { customizationMode: "RULESET_CUSTOMIZABLE", definition: definition(SAGE_2014) },
        null,
      ).map((issue) => issue.path),
    ).toEqual([["customizationMode"]]);
    // From 2024 on a choice offers origin feats only; a fixed feat is held to it by its reference.
    expect(
      validateBackgroundEdition(
        {
          customizationMode: "FIXED",
          definition: definition({
            ...ACOLYTE_2024,
            featGrants: [{ key: "feat", selectionMode: "CHOOSE", optionFilter: { categories: ["GENERAL"] } }],
          }),
        },
        [2024],
      ).map((issue) => issue.path),
    ).toEqual([["featGrants", 0, "optionFilter", "categories"]]);
  });

  it("names what referenced assets must not be", () => {
    const references = collectRuleReferences(definition({ ...ACOLYTE_2024, ...{ featureGrants: SAGE_2014.featureGrants } }), true);
    const at = (path: string) => references.find((reference) => reference.path.join(".") === path)?.forbids ?? [];

    expect(at("proficiencyGrants.1.options.0.assetId")).toContain("ITEM_CATEGORY_WEAPON");
    expect(at("proficiencyGrants.1.options.0.assetId")).not.toContain("ITEM_CATEGORY_TOOL");
    expect(at("featGrants.0.featAssetId")).toEqual(
      expect.arrayContaining(["FEAT_CATEGORY_GENERAL", "FEAT_CATEGORY_EPIC_BOON"]),
    );
    expect(at("featGrants.0.featAssetId")).not.toContain("FEAT_CATEGORY_ORIGIN");
    expect(at("featureGrants.0.featureAssetId")).toEqual(["USES_CLASS_LEVEL", "RAISES_ABILITY_SCORE"]);
    expect(at("equipmentOptions.0.entries.0.itemAssetId")).toEqual([]);
    expect(collectRuleReferences(definition(SAGE_2014), false)[0]?.forbids).toEqual(["USES_CLASS_LEVEL"]);
  });
});

describe("player view", () => {
  it("leaves out GM-only sections and hidden feats, tools, features and items", () => {
    const stored = definition({
      ...ACOLYTE_2024,
      sections: [
        { key: "hook", title: "Hook", content: "Secret", gmOnly: true },
        { key: "lore", title: "Lore", content: "Public" },
      ],
      featGrants: [
        { key: "origin_feat", selectionMode: "FIXED", featAssetId: HIDDEN_ID },
        { key: "chosen", selectionMode: "CHOOSE", optionFilter: { categories: ["ORIGIN"], featAssetIds: [HIDDEN_ID] } },
      ],
      featureGrants: [{ key: "secret", featureAssetId: HIDDEN_ID }],
    });
    const view = toPlayerDefinition(stored, (id) => id !== HIDDEN_ID && id !== TOOL_ID);

    expect(view.sections.map((section) => section.key)).toEqual(["lore"]);
    expect(view.featGrants).toEqual([]);
    expect(view.featureGrants).toEqual([]);
    // The tool grant's only option is hidden: left out, since no options would mean "any tool".
    expect(view.proficiencyGrants.map((grant) => grant.key)).toEqual(["skills"]);
    // Option "a" contains the hidden tool, so the whole package is left out.
    expect(view.equipmentOptions.map((option) => option.code)).toEqual(["b"]);
  });
});

describe("feat repeatability", () => {
  it("lets ONCE feats be taken once, LIMITED ones up to their maximum and the others again", () => {
    expect(canTakeFeatAgain({ mode: "ONCE" }, 0)).toBe(true);
    expect(canTakeFeatAgain({ mode: "ONCE" }, 1)).toBe(false);
    expect(canTakeFeatAgain(null, 1)).toBe(false);
    expect(canTakeFeatAgain({ mode: "LIMITED", maximumOccurrences: 2 }, 1)).toBe(true);
    expect(canTakeFeatAgain({ mode: "LIMITED", maximumOccurrences: 2 }, 2)).toBe(false);
    expect(canTakeFeatAgain({ mode: "DISTINCT_BY_CHOICE" }, 3)).toBe(true);
  });

  it("refuses the same feat in two fixed grants of one background", () => {
    expect(
      validateBackgroundDefinition(
        definition({
          featGrants: [
            { key: "a", selectionMode: "FIXED", featAssetId: FEAT_ID },
            { key: "b", selectionMode: "FIXED", featAssetId: FEAT_ID },
          ],
        }),
      ).map((issue) => issue.message),
    ).toEqual([`Feat '${FEAT_ID}' is granted more than once`]);
  });
});

describe("background selection", () => {
  const acolyte = { customizationMode: "FIXED" as const, definition: definition(ACOLYTE_2024) };
  const sage = { customizationMode: "RULESET_CUSTOMIZABLE" as const, definition: definition(SAGE_2014) };
  const gear = { optionCode: "a", itemChoices: { book: ITEM_ID } };

  it("distributes the 2024 ability increase as +2/+1 or +1/+1/+1 from the allowed abilities", () => {
    const ok = (abilityAllocations: Record<string, number>) =>
      validateBackgroundSelection(acolyte, resolve({ abilityAllocations, equipmentChoice: gear })).issues;

    expect(ok({ wis: 2, cha: 1 })).toEqual([]);
    expect(ok({ int: 1, wis: 1, cha: 1 })).toEqual([]);
    expect(ok({ wis: 3 }).map((issue) => issue.message)).toEqual(["At most +2 on one ability"]);
    expect(ok({ wis: 2 }).map((issue) => issue.message)).toEqual([
      "Distribute exactly +3 (+2/+1 or +1/+1/+1)",
    ]);
    expect(ok({ str: 2, wis: 1 }).map((issue) => issue.message)).toEqual([
      "str is not one of the background's abilities",
    ]);
  });

  it("returns fixed proficiencies, the feat, equipment and coins with their source", () => {
    const selection = validateBackgroundSelection(
      acolyte,
      resolve({ abilityAllocations: { wis: 2, int: 1 }, equipmentChoice: gear, actor: { proficiencies: ["skill.insight"] } }),
    );

    expect(selection.issues).toEqual([]);
    expect(selection.proficiencies.map((proficiency) => proficiency.proficiencyKey)).toEqual([
      "skill.insight",
      "skill.religion",
      `tool.${TOOL_ID}`,
    ]);
    expect(selection.feats).toEqual([{ grantKey: "origin_feat", featAssetId: FEAT_ID, chosen: false }]);
    expect(selection.equipment).toEqual({
      optionCode: "a",
      currency: { GP: 8 },
      items: [
        { entryKey: "tool", itemAssetId: TOOL_ID, quantity: 1, choiceFilter: null },
        expect.objectContaining({ entryKey: "book", itemAssetId: ITEM_ID }),
      ],
    });
    expect(selection.conflicts.map((conflict) => conflict.proficiencyKey)).toEqual(["skill.insight"]);
  });

  it("checks proficiency, equipment and prompt choices of a 2014 background", () => {
    const valid = validateBackgroundSelection(
      sage,
      resolve({
        proficiencyChoices: { languages: ["elvish", "dwarvish"] },
        promptSelections: [{ tableKey: "ideal", roll: 3 }, { tableKey: "bond", optionIndex: 0 }, { tableKey: "bond", customText: "Own" }],
      }),
    );

    expect(valid.issues).toEqual([]);
    expect(valid.prompts.map((prompt) => prompt.text)).toEqual(["Beauty.", "My library.", "Own"]);

    const invalid = validateBackgroundSelection(
      sage,
      resolve({
        abilityAllocations: { str: 1 },
        proficiencyChoices: { languages: ["elvish"], skills: ["stealth"] },
        equipmentChoice: gear,
        promptSelections: [{ tableKey: "ideal", roll: 5 }],
      }),
    );

    expect(invalid.issues.map((issue) => issue.path.join("."))).toEqual([
      "proficiencyChoices.skills",
      "proficiencyChoices.languages",
      "abilityAllocations",
      "equipmentChoice",
      "promptSelections.0.roll",
    ]);
  });

  it("applies the 2014 customization only to customizable backgrounds", () => {
    const customization = {
      skills: ["stealth", "deception"],
      toolsAndLanguages: [{ type: "TOOL", value: TOOL_ID }, { type: "LANGUAGE", value: "elvish" }],
    };
    const customized = validateBackgroundSelection(sage, resolve({ customization }));

    expect(customized.issues).toEqual([]);
    expect(customized.selectionMode).toBe("RULESET_CUSTOMIZED");
    expect(customized.proficiencies.map((item) => item.proficiencyKey)).toEqual([
      "skill.stealth",
      "skill.deception",
      `tool.${TOOL_ID}`,
      "language.elvish",
    ]);

    expect(
      validateBackgroundSelection(sage, resolve({ customization: { ...customization, skills: ["stealth"] } })).issues,
    ).toEqual([{ path: ["customization", "skills"], message: "Choose exactly two skills" }]);
    expect(
      validateBackgroundSelection(acolyte, resolve({ customization, abilityAllocations: { wis: 2, int: 1 }, equipmentChoice: gear }))
        .issues,
    ).toEqual([{ path: ["customization"], message: "This background cannot be customized" }]);
  });
});
