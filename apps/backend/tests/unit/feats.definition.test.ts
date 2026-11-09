import { CreateFeatSchema } from "#src/modules/feats/domain/dto/CreateFeatDto";
import {
  type FeatDefinition,
  FeatDefinitionSchema,
  type PrerequisiteNode,
  RepeatabilitySchema,
} from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import { UpdateFeatSchema } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import {
  collectPrerequisiteReferences,
  featCategoriesFor,
  toPlayerChoices,
  toPlayerGrants,
  toPlayerPrerequisites,
  validateFeatDefinition,
} from "#src/modules/feats/domain/FeatDefinition";
import {
  evaluateFeatEligibility,
  evaluatePrerequisite,
  type EligibilityFeat,
  validateFeatChoices,
} from "#src/modules/feats/domain/FeatEligibility";

const CLASS_ID = "10000000-0000-4000-8000-000000000001";
const SPECIES_ID = "10000000-0000-4000-8000-000000000002";
const FEAT_ID = "10000000-0000-4000-8000-000000000003";
const OTHER_FEAT_ID = "10000000-0000-4000-8000-000000000004";
const FEATURE_ID = "10000000-0000-4000-8000-000000000005";
const TARGET_ID = "10000000-0000-4000-8000-000000000006";

const ONCE = { mode: "ONCE", maximumOccurrences: null, repeatabilityChoiceKey: null } as const;

const definition = (parts: Partial<FeatDefinition> = {}): FeatDefinition =>
  FeatDefinitionSchema.parse({ prerequisites: null, repeatability: ONCE, choices: [], featureGrants: [], ...parts });

const elementChoice = {
  key: "element",
  label: "Damage type",
  choiceType: "DAMAGE_TYPE",
  minimumSelections: 1,
  maximumSelections: 1,
  options: ["acid", "cold", "fire"].map((code) => ({ code, label: code })),
};

const feat = (parts: Partial<EligibilityFeat> = {}, def: Partial<FeatDefinition> = {}): EligibilityFeat => ({
  assetId: FEAT_ID,
  category: "GENERAL",
  minimumCharacterLevel: null,
  definition: definition(def),
  ...parts,
});

describe("feat definition schemas", () => {
  it("accepts every node type and nests ALL, ANY and NOT", () => {
    const tree: PrerequisiteNode = {
      type: "ALL",
      children: [
        { type: "ANY", children: [{ type: "ABILITY_MIN", ability: "str", minimum: 13 }, { type: "ABILITY_MIN", ability: "dex", minimum: 13 }] },
        { type: "NOT", child: { type: "FEAT", assetId: OTHER_FEAT_ID } },
        { type: "PROFICIENCY", proficiency: "armor.heavy" },
        { type: "CLASS", assetId: CLASS_ID, minimumLevel: 3 },
        { type: "SPECIES", assetId: SPECIES_ID },
        { type: "SPELLCASTING" },
        { type: "LEVEL", minimumCharacterLevel: 4 },
        { type: "CUSTOM", key: "blessed", description: "Blessed by a god" },
      ],
    };

    expect(definition({ prerequisites: tree }).prerequisites).toEqual(tree);
  });

  it("refuses empty groups, unknown node types and extra fields", () => {
    for (const prerequisites of [
      { type: "ALL", children: [] },
      { type: "MAGIC" },
      { type: "LEVEL", minimumCharacterLevel: 4, extra: true },
      { type: "LEVEL", minimumCharacterLevel: 21 },
      { type: "CLASS", assetId: "not-an-id" },
    ]) {
      expect(FeatDefinitionSchema.safeParse({ prerequisites, repeatability: ONCE, choices: [], featureGrants: [] }).success).toBe(false);
    }
  });

  it("checks the repeatability modes", () => {
    expect(RepeatabilitySchema.safeParse({ mode: "ONCE" }).success).toBe(true);
    expect(RepeatabilitySchema.safeParse({ mode: "UNLIMITED" }).success).toBe(true);
    expect(RepeatabilitySchema.safeParse({ mode: "LIMITED", maximumOccurrences: 2 }).success).toBe(true);
    expect(RepeatabilitySchema.safeParse({ mode: "LIMITED" }).success).toBe(false);
    expect(RepeatabilitySchema.safeParse({ mode: "LIMITED", maximumOccurrences: 1 }).success).toBe(false);
    expect(RepeatabilitySchema.safeParse({ mode: "ONCE", maximumOccurrences: 3 }).success).toBe(false);
    expect(RepeatabilitySchema.safeParse({ mode: "ONCE", repeatabilityChoiceKey: "element" }).success).toBe(false);
    expect(RepeatabilitySchema.safeParse({ mode: "DISTINCT_BY_CHOICE" }).success).toBe(false);
    expect(RepeatabilitySchema.safeParse({ mode: "DISTINCT_BY_CHOICE", repeatabilityChoiceKey: "element" }).success).toBe(true);
  });

  it("checks choices: options or filter, counts, codes and asset types", () => {
    const parse = (choice: Record<string, unknown>) =>
      FeatDefinitionSchema.safeParse({ prerequisites: null, repeatability: ONCE, featureGrants: [], choices: [{ ...elementChoice, ...choice }] }).success;

    expect(parse({})).toBe(true);
    expect(parse({ options: [] })).toBe(false);
    expect(parse({ optionFilter: { assetTypes: ["FEATURE"] } })).toBe(false);
    expect(parse({ minimumSelections: 4, maximumSelections: 4 })).toBe(false);
    expect(parse({ minimumSelections: 2, maximumSelections: 1 })).toBe(false);
    expect(parse({ options: [{ code: "a", label: "A" }, { code: "a", label: "B" }] })).toBe(false);
    expect(parse({ options: [{ code: "a", label: "A", linkedAssetId: FEATURE_ID }] })).toBe(false);
    expect(parse({ choiceType: "SPELL", options: [], optionFilter: { assetTypes: ["SPELL"], criteria: { level: 1 } } })).toBe(true);
    expect(parse({ choiceType: "SPELL", options: [], optionFilter: { assetTypes: ["FEAT"] } })).toBe(false);
  });

  it("checks grants: targets only for upgrades and replacements, never the feature itself", () => {
    const parse = (grant: Record<string, unknown>) =>
      FeatDefinitionSchema.safeParse({ prerequisites: null, repeatability: ONCE, choices: [], featureGrants: [{ key: "g", featureAssetId: FEATURE_ID, ...grant }] }).success;

    expect(parse({})).toBe(true);
    expect(parse({ targetFeatureAssetId: TARGET_ID })).toBe(false);
    expect(parse({ operation: "UPGRADE" })).toBe(false);
    expect(parse({ operation: "REPLACE", targetFeatureAssetId: FEATURE_ID })).toBe(false);
    expect(parse({ operation: "UPGRADE", targetFeatureAssetId: TARGET_ID })).toBe(true);
    expect(parse({ bindings: [{ parameterKey: "p", bindingSource: "FEAT_CHOICE" }] })).toBe(false);
    expect(parse({ bindings: [{ parameterKey: "p", bindingSource: "FEAT_CHOICE", choiceKey: "c", staticValue: 1 }] })).toBe(false);
  });
});

describe("validateFeatDefinition", () => {
  const issuesOf = (parts: Partial<FeatDefinition>) =>
    validateFeatDefinition(definition(parts)).map((issue) => issue.message);

  it("limits depth and size of the prerequisite tree", () => {
    let deep: PrerequisiteNode = { type: "SPELLCASTING" };

    for (let index = 0; index < 6; index += 1) {
      deep = { type: "NOT", child: deep };
    }

    expect(issuesOf({ prerequisites: deep })).toEqual([expect.stringContaining("nested deeper")]);

    const wide: PrerequisiteNode = {
      type: "ANY",
      children: Array.from({ length: 50 }, () => ({ type: "SPELLCASTING" }) as const),
    };

    expect(issuesOf({ prerequisites: wide })).toEqual([expect.stringContaining("more than 50 nodes")]);
  });

  it("checks choice keys and dependencies", () => {
    const choice = (key: string, dependsOnChoiceKey: string | null = null) => ({ ...elementChoice, key, dependsOnChoiceKey });

    expect(issuesOf({ choices: [choice("a"), choice("a")] as never })).toEqual(["Key 'a' is used more than once"]);
    expect(issuesOf({ choices: [choice("a", "a")] as never })).toEqual(["A choice cannot depend on itself"]);
    expect(issuesOf({ choices: [choice("a", "b")] as never })).toEqual(["Unknown choice 'b'"]);
    expect(issuesOf({ choices: [choice("a", "b"), choice("b", "a")] as never })).toEqual([
      "Choice dependencies form a cycle",
      "Choice dependencies form a cycle",
    ]);
    expect(issuesOf({ choices: [choice("a"), choice("b", "a")] as never })).toEqual([]);
  });

  it("needs a known, answered choice for DISTINCT_BY_CHOICE", () => {
    const repeatability = { mode: "DISTINCT_BY_CHOICE", maximumOccurrences: null, repeatabilityChoiceKey: "element" } as const;

    expect(issuesOf({ repeatability })).toEqual(["Unknown choice 'element'"]);
    expect(issuesOf({ repeatability, choices: [{ ...elementChoice, minimumSelections: 0 }] as never })).toEqual([
      expect.stringContaining("must be answered"),
    ]);
    expect(issuesOf({ repeatability, choices: [elementChoice] as never })).toEqual([]);
  });

  it("checks grant keys, bindings and upgrade cycles", () => {
    const grant = (key: string, extra: Record<string, unknown> = {}) => ({ key, featureAssetId: FEATURE_ID, ...extra });

    expect(issuesOf({ featureGrants: [grant("a"), grant("a")] as never })).toEqual(["Key 'a' is used more than once"]);
    expect(
      issuesOf({
        featureGrants: [
          grant("a", { bindings: [{ parameterKey: "p", bindingSource: "FEAT_CHOICE", choiceKey: "missing" }] }),
          grant("b", { bindings: [{ parameterKey: "p", bindingSource: "CONTEXT", contextKey: "level.unknown" }] }),
        ] as never,
      }),
    ).toEqual(["Unknown choice 'missing'", "Unknown context value 'level.unknown'"]);
    expect(
      issuesOf({
        featureGrants: [
          { key: "a", featureAssetId: FEATURE_ID, operation: "UPGRADE", targetFeatureAssetId: TARGET_ID },
          { key: "b", featureAssetId: TARGET_ID, operation: "REPLACE", targetFeatureAssetId: FEATURE_ID },
        ] as never,
      }),
    ).toEqual(["Upgrades and replacements form a cycle", "Upgrades and replacements form a cycle"]);
  });

  it("runs on create, so a request with broken rules is a 400", () => {
    const result = CreateFeatSchema.safeParse({
      name: "Elemental Adept",
      category: "GENERAL",
      repeatability: { mode: "DISTINCT_BY_CHOICE", repeatabilityChoiceKey: "element" },
    });

    expect(result.success).toBe(false);
  });

  it("needs at least one field on update", () => {
    expect(UpdateFeatSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1 }).success).toBe(false);
    expect(UpdateFeatSchema.safeParse({ expectedVersion: 1, expectedAssetVersion: 1, category: "ORIGIN" }).success).toBe(true);
  });
});

describe("feat categories per edition", () => {
  it("knows only GENERAL before 2024 and all four from 2024 on", () => {
    expect(featCategoriesFor(2014)).toEqual(["GENERAL"]);
    expect(featCategoriesFor(2024)).toEqual(["ORIGIN", "GENERAL", "FIGHTING_STYLE", "EPIC_BOON"]);
  });
});

describe("prerequisite evaluation", () => {
  const truth = (node: PrerequisiteNode, actor: Parameters<typeof evaluatePrerequisite>[1]) =>
    evaluatePrerequisite(node, actor).truth;

  it("evaluates every leaf type, UNKNOWN when the fact is missing", () => {
    const cases: [PrerequisiteNode, Parameters<typeof evaluatePrerequisite>[1], string][] = [
      [{ type: "ABILITY_MIN", ability: "str", minimum: 13 }, { abilities: { str: 13 } }, "TRUE"],
      [{ type: "ABILITY_MIN", ability: "str", minimum: 13 }, { abilities: { str: 12 } }, "FALSE"],
      [{ type: "ABILITY_MIN", ability: "str", minimum: 13 }, { abilities: { dex: 18 } }, "UNKNOWN"],
      [{ type: "PROFICIENCY", proficiency: "armor.heavy" }, { proficiencies: ["armor.heavy"] }, "TRUE"],
      [{ type: "PROFICIENCY", proficiency: "armor.heavy" }, { proficiencies: [] }, "FALSE"],
      [{ type: "PROFICIENCY", proficiency: "armor.heavy" }, {}, "UNKNOWN"],
      [{ type: "CLASS", assetId: CLASS_ID, minimumLevel: 3 }, { classes: [{ classAssetId: CLASS_ID, level: 3 }] }, "TRUE"],
      [{ type: "CLASS", assetId: CLASS_ID, minimumLevel: 3 }, { classes: [{ classAssetId: CLASS_ID, level: 2 }] }, "FALSE"],
      [{ type: "CLASS", assetId: CLASS_ID }, { classes: [{ classAssetId: CLASS_ID, level: 1 }] }, "TRUE"],
      [{ type: "CLASS", assetId: CLASS_ID }, {}, "UNKNOWN"],
      [{ type: "SPECIES", assetId: SPECIES_ID }, { speciesAssetIds: [SPECIES_ID] }, "TRUE"],
      [{ type: "SPECIES", assetId: SPECIES_ID }, { speciesAssetIds: [] }, "FALSE"],
      [{ type: "FEAT", assetId: OTHER_FEAT_ID }, { feats: [{ featAssetId: OTHER_FEAT_ID, choices: {} }] }, "TRUE"],
      [{ type: "FEAT", assetId: OTHER_FEAT_ID }, { feats: [] }, "FALSE"],
      [{ type: "SPELLCASTING" }, { spellcasting: true }, "TRUE"],
      [{ type: "SPELLCASTING" }, { spellcasting: false }, "FALSE"],
      [{ type: "SPELLCASTING" }, {}, "UNKNOWN"],
      [{ type: "LEVEL", minimumCharacterLevel: 4 }, { characterLevel: 4 }, "TRUE"],
      [{ type: "LEVEL", minimumCharacterLevel: 4 }, { characterLevel: 3 }, "FALSE"],
      [{ type: "LEVEL", minimumCharacterLevel: 4 }, {}, "UNKNOWN"],
      [{ type: "CUSTOM", key: "blessed", description: "Blessed" }, { facts: { blessed: true } }, "TRUE"],
      [{ type: "CUSTOM", key: "blessed", description: "Blessed" }, { facts: { blessed: false } }, "FALSE"],
      [{ type: "CUSTOM", key: "blessed", description: "Blessed" }, { facts: {} }, "UNKNOWN"],
    ];

    for (const [node, actor, expected] of cases) {
      expect([node, truth(node, actor)]).toEqual([node, expected]);
    }
  });

  it("combines with three-valued logic", () => {
    const strength = { type: "ABILITY_MIN", ability: "str", minimum: 13 } as const;
    const caster = { type: "SPELLCASTING" } as const;
    const all: PrerequisiteNode = { type: "ALL", children: [strength, caster] };
    const any: PrerequisiteNode = { type: "ANY", children: [strength, caster] };

    expect(truth(all, { abilities: { str: 15 }, spellcasting: true })).toBe("TRUE");
    expect(truth(all, { abilities: { str: 15 } })).toBe("UNKNOWN");
    expect(truth(all, { abilities: { str: 8 } })).toBe("FALSE");
    expect(truth(any, { abilities: { str: 15 } })).toBe("TRUE");
    expect(truth(any, { abilities: { str: 8 } })).toBe("UNKNOWN");
    expect(truth(any, { abilities: { str: 8 }, spellcasting: false })).toBe("FALSE");
    expect(truth({ type: "NOT", child: caster }, { spellcasting: true })).toBe("FALSE");
    expect(truth({ type: "NOT", child: caster }, { spellcasting: false })).toBe("TRUE");
    expect(truth({ type: "NOT", child: caster }, {})).toBe("UNKNOWN");
  });

  it("names the failed leaves with their path", () => {
    const result = evaluatePrerequisite(
      { type: "ALL", children: [{ type: "LEVEL", minimumCharacterLevel: 4 }, { type: "FEAT", assetId: OTHER_FEAT_ID }] },
      { characterLevel: 2, feats: [] },
    );

    expect(result.reasons).toEqual([
      expect.objectContaining({ nodeType: "LEVEL", path: ["prerequisites", "children", 0], assetId: null }),
      expect.objectContaining({ nodeType: "FEAT", path: ["prerequisites", "children", 1], assetId: OTHER_FEAT_ID }),
    ]);
  });
});

describe("evaluateFeatEligibility", () => {
  const everything = { characterLevel: 4, feats: [] };

  it("is eligible without prerequisites when the feats are known", () => {
    expect(evaluateFeatEligibility(feat(), everything, {})).toMatchObject({ outcome: "ELIGIBLE", eligible: true, reasons: [] });
  });

  it("is unknown without the facts it needs and lists them", () => {
    const result = evaluateFeatEligibility(
      feat({ minimumCharacterLevel: 4 }, { prerequisites: { type: "ABILITY_MIN", ability: "cha", minimum: 13 } }),
      {},
      {},
    );

    expect(result).toMatchObject({ outcome: "UNKNOWN", eligible: false, reasons: [] });
    expect(result.unknownFacts).toEqual(["abilities.cha", "characterLevel", "feats"]);
  });

  it("checks the minimum level, also against the level of the acquisition", () => {
    const highLevel = feat({ minimumCharacterLevel: 19, category: "GENERAL" });

    expect(evaluateFeatEligibility(highLevel, { ...everything, characterLevel: 18 }, {})).toMatchObject({
      outcome: "INELIGIBLE",
      reasons: [expect.objectContaining({ code: "MINIMUM_LEVEL" })],
    });
    expect(evaluateFeatEligibility(highLevel, { ...everything, characterLevel: 18 }, { characterLevel: 19 }).outcome).toBe("ELIGIBLE");
  });

  it("refuses categories the slot does not accept", () => {
    const origin = feat({ category: "ORIGIN" });

    expect(evaluateFeatEligibility(origin, everything, { allowedCategories: ["GENERAL"] })).toMatchObject({
      outcome: "INELIGIBLE",
      reasons: [expect.objectContaining({ code: "CATEGORY" })],
    });
    expect(evaluateFeatEligibility(origin, everything, { allowedCategories: ["ORIGIN", "GENERAL"] }).outcome).toBe("ELIGIBLE");
  });

  it("applies every repeatability mode", () => {
    const owned = (count: number, element?: string) => ({
      ...everything,
      feats: Array.from({ length: count }, (_, index) => ({
        featAssetId: FEAT_ID,
        choices: element ? { element: [index === 0 ? element : "cold"] } : {},
      })),
    });

    expect(evaluateFeatEligibility(feat(), owned(1), {}).outcome).toBe("INELIGIBLE");
    expect(evaluateFeatEligibility(feat({}, { repeatability: { mode: "UNLIMITED", maximumOccurrences: null, repeatabilityChoiceKey: null } }), owned(5), {}).outcome).toBe("ELIGIBLE");
    expect(evaluateFeatEligibility(feat({}, { repeatability: { mode: "UNLIMITED", maximumOccurrences: null, repeatabilityChoiceKey: null } }), {}, {}).unknownFacts).toEqual([]);

    const limited = feat({}, { repeatability: { mode: "LIMITED", maximumOccurrences: 2, repeatabilityChoiceKey: null } });

    expect(evaluateFeatEligibility(limited, owned(1), {}).outcome).toBe("ELIGIBLE");
    expect(evaluateFeatEligibility(limited, owned(2), {}).outcome).toBe("INELIGIBLE");

    const distinct = feat(
      {},
      {
        repeatability: { mode: "DISTINCT_BY_CHOICE", maximumOccurrences: null, repeatabilityChoiceKey: "element" },
        choices: [elementChoice] as never,
      },
    );
    const once = evaluateFeatEligibility(distinct, owned(1, "fire"), {});

    expect(once.outcome).toBe("ELIGIBLE");
    expect(once.allowedChoices[0]).toMatchObject({ excludedValues: ["fire"] });
    expect(once.allowedChoices[0]?.options.map((option) => option.code)).toEqual(["acid", "cold"]);

    const exhausted = evaluateFeatEligibility(distinct, {
      ...everything,
      feats: ["acid", "cold", "fire"].map((element) => ({ featAssetId: FEAT_ID, choices: { element: [element] } })),
    }, {});

    expect(exhausted).toMatchObject({ outcome: "INELIGIBLE", reasons: [expect.objectContaining({ code: "REPEATABILITY" })] });
  });

  it("reports failures before unknown facts", () => {
    const result = evaluateFeatEligibility(
      feat({}, { prerequisites: { type: "ALL", children: [{ type: "SPELLCASTING" }, { type: "LEVEL", minimumCharacterLevel: 8 }] } }),
      { characterLevel: 4, feats: [] },
      {},
    );

    expect(result).toMatchObject({ outcome: "INELIGIBLE", unknownFacts: [] });
    expect(result.reasons).toEqual([expect.objectContaining({ nodeType: "LEVEL" })]);
  });
});

describe("validateFeatChoices", () => {
  const spellList = {
    key: "list",
    label: "List",
    choiceType: "CUSTOM",
    minimumSelections: 1,
    maximumSelections: 1,
    options: [{ code: "cleric", label: "Cleric" }, { code: "wizard", label: "Wizard" }],
  };
  const choices = definition({
    choices: [spellList, { ...elementChoice, dependsOnChoiceKey: "list", minimumSelections: 0 }] as never,
  }).choices;

  it("accepts valid answers", () => {
    expect(validateFeatChoices(choices, { list: ["wizard"], element: ["fire"] })).toEqual([]);
  });

  it("names unknown keys, counts, options, dependencies and repeated values", () => {
    expect(validateFeatChoices(choices, { other: ["x"], list: [] }).map((issue) => issue.message)).toEqual([
      "Unknown choice 'other'",
      "Choose between 1 and 1 values",
    ]);
    expect(validateFeatChoices(choices, { list: ["bard"] }).map((issue) => issue.message)).toEqual([
      "'bard' is no option of the choice",
    ]);
    expect(validateFeatChoices([choices[1] as never], { element: ["fire"] }).map((issue) => issue.message)).toEqual([
      "Answer 'list' first",
    ]);
    expect(validateFeatChoices(choices, { list: ["wizard"], element: ["fire"] }, { element: ["fire"] }).map((issue) => issue.message)).toEqual([
      "'fire' was already taken with an earlier occurrence",
    ]);
  });
});

describe("player projection", () => {
  const visible = (assetId: string) => assetId !== CLASS_ID && assetId !== TARGET_ID;

  it("keeps the tree but hides references to assets the player may not see", () => {
    const tree: PrerequisiteNode = {
      type: "ANY",
      children: [{ type: "CLASS", assetId: CLASS_ID }, { type: "NOT", child: { type: "SPECIES", assetId: SPECIES_ID } }],
    };

    expect(toPlayerPrerequisites(tree, visible)).toEqual({
      type: "ANY",
      children: [{ type: "CLASS", assetId: null }, { type: "NOT", child: { type: "SPECIES", assetId: SPECIES_ID } }],
    });
    expect(collectPrerequisiteReferences(tree).map((reference) => reference.assetTypes)).toEqual([
      ["CLASS"],
      ["SPECIES", "SPECIES_VARIANT"],
    ]);
  });

  it("drops hidden grants and options", () => {
    const def = definition({
      choices: [
        {
          key: "option",
          label: "Option",
          choiceType: "FEATURE_OPTION",
          minimumSelections: 1,
          maximumSelections: 1,
          options: [
            { code: "seen", label: "Seen", linkedAssetId: FEATURE_ID },
            { code: "hidden", label: "Hidden", linkedAssetId: CLASS_ID },
          ],
        },
      ] as never,
      featureGrants: [
        { key: "a", featureAssetId: FEATURE_ID },
        { key: "b", featureAssetId: FEATURE_ID, operation: "UPGRADE", targetFeatureAssetId: TARGET_ID },
      ] as never,
    });

    expect(toPlayerChoices(def.choices, visible)[0]?.options.map((option) => option.code)).toEqual(["seen"]);
    expect(toPlayerGrants(def.featureGrants, visible).map((grant) => grant.key)).toEqual(["a"]);
  });
});
