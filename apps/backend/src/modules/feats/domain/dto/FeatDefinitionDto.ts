import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema, type AssetRow } from "#src/modules/assets/index";
import { ABILITIES, featureKeyDto } from "#src/modules/features/index";
import { FEAT_MAX_CHARACTER_LEVEL } from "#src/modules/feats/domain/entities/FeatsTable";

/**
 * Schemas of the parts of a feat definition. Each part is stored as one jsonb value; rules across
 * entries (unique keys, choice dependencies, the repeatability choice, tree limits, grant targets)
 * are checked by `validateFeatDefinition`, references to other assets by the service.
 */

export const REPEATABILITY_MODES = ["ONCE", "LIMITED", "UNLIMITED", "DISTINCT_BY_CHOICE"] as const;
export const GRANT_OPERATIONS = ["GRANT", "UPGRADE", "REPLACE"] as const;
/** Parameters of a granted feature are fixed, come from the actor or from a choice of the feat. */
export const BINDING_SOURCES = ["STATIC", "CONTEXT", "FEAT_CHOICE"] as const;

export const FEAT_CHOICE_TYPES = [
  "ABILITY_SCORE",
  "SAVING_THROW",
  "SKILL_PROFICIENCY",
  "TOOL_PROFICIENCY",
  "WEAPON_PROFICIENCY",
  "ARMOR_PROFICIENCY",
  "LANGUAGE",
  "DAMAGE_TYPE",
  "SPELL",
  "FEAT",
  "FEATURE_OPTION",
  "CUSTOM",
] as const;

export type FeatChoiceType = (typeof FEAT_CHOICE_TYPES)[number];
export type RepeatabilityMode = (typeof REPEATABILITY_MODES)[number];
export type GrantOperation = (typeof GRANT_OPERATIONS)[number];

/**
 * Asset types a choice of this type may offer, as linked options or through its filter. Empty
 * means codes only (abilities, skills, languages …).
 */
export const FEAT_CHOICE_ASSET_TYPES: Record<FeatChoiceType, readonly AssetRow["assetType"][]> = {
  ABILITY_SCORE: [],
  SAVING_THROW: [],
  SKILL_PROFICIENCY: [],
  TOOL_PROFICIENCY: ["ITEM"],
  WEAPON_PROFICIENCY: ["ITEM"],
  ARMOR_PROFICIENCY: [],
  LANGUAGE: [],
  DAMAGE_TYPE: [],
  SPELL: ["SPELL"],
  FEAT: ["FEAT"],
  FEATURE_OPTION: ["FEATURE"],
  CUSTOM: [],
};

/** Limits of the prerequisite tree. */
export const PREREQUISITE_MAX_DEPTH = 6;
export const PREREQUISITE_MAX_NODES = 50;

/** Maximum entries per list part. */
export const FEAT_PART_MAX_ITEMS = 20;

const displayOrderDto = z.number().int().min(0).max(1_000);
const labelDto = z.string().trim().min(1).max(160);
const levelDto = z.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL);
const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

// ---------------------------------------------------------------------------
// Prerequisites
// ---------------------------------------------------------------------------

/**
 * A node of the prerequisite tree. `ALL`/`ANY` combine children, `NOT` negates one; the leaves
 * test one fact of the character. `CLASS`, `SPECIES` and `FEAT` refer to assets; in the player
 * view their `assetId` is null when the player may not see the asset.
 */
export type PrerequisiteNode<Ref = string> =
  | { type: "ALL" | "ANY"; children: PrerequisiteNode<Ref>[] }
  | { type: "NOT"; child: PrerequisiteNode<Ref> }
  | { type: "ABILITY_MIN"; ability: (typeof ABILITIES)[number]; minimum: number }
  | { type: "PROFICIENCY"; proficiency: string }
  | { type: "CLASS"; assetId: Ref; minimumLevel?: number | undefined }
  | { type: "SPECIES"; assetId: Ref }
  | { type: "FEAT"; assetId: Ref }
  | { type: "SPELLCASTING" }
  | { type: "LEVEL"; minimumCharacterLevel: number }
  | { type: "CUSTOM"; key: string; description: string };

export const PREREQUISITE_NODE_TYPES = [
  "ALL",
  "ANY",
  "NOT",
  "ABILITY_MIN",
  "PROFICIENCY",
  "CLASS",
  "SPECIES",
  "FEAT",
  "SPELLCASTING",
  "LEVEL",
  "CUSTOM",
] as const;

export type PrerequisiteNodeType = (typeof PREREQUISITE_NODE_TYPES)[number];

function prerequisiteNodeSchema<Ref extends string | null>(
  refDto: z.ZodType<Ref>,
): z.ZodType<PrerequisiteNode<Ref>> {
  const node: z.ZodType<PrerequisiteNode<Ref>> = z.lazy(() =>
    z.discriminatedUnion("type", [
      z.strictObject({
        type: z.enum(["ALL", "ANY"]),
        children: z.array(node).min(1).max(PREREQUISITE_MAX_NODES),
      }),
      z.strictObject({ type: z.literal("NOT"), child: node }),
      z.strictObject({
        type: z.literal("ABILITY_MIN"),
        ability: z.enum(ABILITIES),
        minimum: z.number().int().min(1).max(30),
      }),
      z.strictObject({
        type: z.literal("PROFICIENCY"),
        /** A proficiency key as character snapshots list them, e.g. `armor.heavy`. */
        proficiency: z.string().trim().min(1).max(100),
      }),
      z.strictObject({
        type: z.literal("CLASS"),
        assetId: refDto,
        /** Without it any level of the class counts. */
        minimumLevel: levelDto.optional(),
      }),
      z.strictObject({ type: z.literal("SPECIES"), assetId: refDto }),
      z.strictObject({ type: z.literal("FEAT"), assetId: refDto }),
      z.strictObject({ type: z.literal("SPELLCASTING") }),
      z.strictObject({ type: z.literal("LEVEL"), minimumCharacterLevel: levelDto }),
      z.strictObject({
        type: z.literal("CUSTOM"),
        /** Name of a campaign fact the character snapshot answers with true or false. */
        key: featureKeyDto,
        description: z.string().trim().min(1).max(500),
      }),
    ]),
  ) as z.ZodType<PrerequisiteNode<Ref>>;

  return node;
}

export const PrerequisiteNodeSchema = prerequisiteNodeSchema(uuidDto);

/** The tree as players see it: references to assets they may not see are null. */
export const PrerequisiteNodeViewSchema = prerequisiteNodeSchema(uuidDto.nullable());

// ---------------------------------------------------------------------------
// Repeatability
// ---------------------------------------------------------------------------

/**
 * How often a character may take the feat. `LIMITED` up to `maximumOccurrences` (at least 2),
 * `DISTINCT_BY_CHOICE` again and again with a different answer to `repeatabilityChoiceKey` each
 * time (Elemental Adept: another damage type).
 */
export const RepeatabilitySchema = z
  .strictObject({
    mode: z.enum(REPEATABILITY_MODES),
    maximumOccurrences: z.number().int().min(2).max(20).nullable().default(null),
    repeatabilityChoiceKey: featureKeyDto.nullable().default(null),
  })
  .superRefine((rule, ctx) => {
    if ((rule.mode === "LIMITED") !== (rule.maximumOccurrences !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["maximumOccurrences"],
        message: "Only LIMITED repeatability has a maximum, and it needs one",
      });
    }

    if ((rule.mode === "DISTINCT_BY_CHOICE") !== (rule.repeatabilityChoiceKey !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["repeatabilityChoiceKey"],
        message: "Only DISTINCT_BY_CHOICE repeatability names a choice, and it needs one",
      });
    }
  });

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export const FeatChoiceOptionSchema = z.strictObject({
  code: featureKeyDto,
  label: labelDto,
  linkedAssetId: uuidDto.nullable().default(null),
});

const criterionValueDto = z.union([
  z.string().min(1).max(100),
  z.number(),
  z.boolean(),
  z.array(z.string().min(1).max(100)).max(20),
]);

/**
 * Options from a catalog instead of a fixed list: assets of these types that the campaign may use.
 * `criteria` narrow them further (e.g. `{ level: 1, school: ["divination", "enchantment"] }`) and
 * are applied by the module that owns the asset type once it exists.
 */
export const FeatChoiceFilterSchema = z.strictObject({
  assetTypes: z.array(AssetBaseSchema.shape.assetType).min(1).max(5),
  criteria: z.record(featureKeyDto, criterionValueDto).default({}),
});

const featChoiceShape = {
  key: featureKeyDto,
  label: labelDto,
  choiceType: z.enum(FEAT_CHOICE_TYPES),
  minimumSelections: z.number().int().min(0).max(20),
  maximumSelections: z.number().int().min(1).max(20),
  /** Another choice that must be answered first, e.g. a spell list before its spells. */
  dependsOnChoiceKey: featureKeyDto.nullable().default(null),
  optionFilter: FeatChoiceFilterSchema.nullable().default(null),
  displayOrder: displayOrderDto.default(0),
  options: z.array(FeatChoiceOptionSchema).max(100).default([]),
};

/**
 * Choices as stored, without the checks; for the player view, which leaves out options the player
 * may not see, so a choice may have fewer options than it requires there.
 */
export const FeatChoiceViewSchema = z.strictObject(featChoiceShape);

export const FeatChoiceSchema = z.strictObject(featChoiceShape).superRefine((choice, ctx) => {
  const allowed = FEAT_CHOICE_ASSET_TYPES[choice.choiceType];

  if (choice.minimumSelections > choice.maximumSelections) {
    ctx.addIssue({
      code: "custom",
      path: ["minimumSelections"],
      message: "The minimum cannot exceed the maximum",
    });
  }

  if ((choice.options.length === 0) === (choice.optionFilter === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "A choice has either fixed options or a filter",
    });
  }

  if (choice.optionFilter === null && choice.options.length < choice.minimumSelections) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "A choice needs at least as many options as it requires",
    });
  }

  if (!uniqueBy(choice.options, (option) => option.code)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Option codes must be unique" });
  }

  choice.options.forEach((option, index) => {
    if (option.linkedAssetId !== null && allowed.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options", index, "linkedAssetId"],
        message: `Options of a ${choice.choiceType} choice link no assets`,
      });
    }
  });

  choice.optionFilter?.assetTypes.forEach((type, index) => {
    if (!allowed.includes(type)) {
      ctx.addIssue({
        code: "custom",
        path: ["optionFilter", "assetTypes", index],
        message: `A ${choice.choiceType} choice cannot offer assets of type ${type}`,
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Feature grants
// ---------------------------------------------------------------------------

/** Where the value of a feature parameter comes from when the feat grants the feature. */
export const FeatFeatureBindingSchema = z
  .strictObject({
    parameterKey: featureKeyDto,
    bindingSource: z.enum(BINDING_SOURCES),
    staticValue: z.json().nullable().default(null),
    contextKey: z.string().min(1).max(100).nullable().default(null),
    /** The feat choice whose (first) answer fills the parameter. */
    choiceKey: featureKeyDto.nullable().default(null),
  })
  .superRefine((binding, ctx) => {
    const set = {
      STATIC: binding.staticValue !== null,
      CONTEXT: binding.contextKey !== null,
      FEAT_CHOICE: binding.choiceKey !== null,
    };
    const valid = Object.entries(set).every(([source, isSet]) => isSet === (source === binding.bindingSource));

    if (!valid) {
      ctx.addIssue({
        code: "custom",
        path: ["bindingSource"],
        message: "A binding sets exactly the value of its source",
      });
    }
  });

const featureGrantShape = {
  key: featureKeyDto,
  featureAssetId: uuidDto,
  operation: z.enum(GRANT_OPERATIONS).default("GRANT"),
  /** The feature an upgrade or replacement applies to, e.g. one the character has from a class. */
  targetFeatureAssetId: uuidDto.nullable().default(null),
  displayOrder: displayOrderDto.default(0),
  bindings: z.array(FeatFeatureBindingSchema).max(20).default([]),
};

/** Grants as stored, without the checks; for the player view, which leaves out hidden bindings. */
export const FeatFeatureGrantViewSchema = z.strictObject({
  ...featureGrantShape,
  bindings: z.array(z.strictObject(FeatFeatureBindingSchema.shape)),
});

export const FeatFeatureGrantSchema = z.strictObject(featureGrantShape).superRefine((grant, ctx) => {
  if (grant.operation === "GRANT" && grant.targetFeatureAssetId !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["targetFeatureAssetId"],
      message: "Plain grants have no target",
    });
  }

  if (grant.operation !== "GRANT") {
    if (grant.targetFeatureAssetId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "Upgrades and replacements need a target",
      });
    } else if (grant.targetFeatureAssetId === grant.featureAssetId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "A feature cannot upgrade or replace itself",
      });
    }
  }

  if (!uniqueBy(grant.bindings, (binding) => binding.parameterKey)) {
    ctx.addIssue({ code: "custom", path: ["bindings"], message: "One binding per parameter" });
  }
});

// ---------------------------------------------------------------------------
// Whole definition
// ---------------------------------------------------------------------------

export const FeatDefinitionSchema = z.strictObject({
  prerequisites: PrerequisiteNodeSchema.nullable(),
  repeatability: RepeatabilitySchema,
  choices: z.array(FeatChoiceSchema).max(FEAT_PART_MAX_ITEMS),
  featureGrants: z.array(FeatFeatureGrantSchema).max(FEAT_PART_MAX_ITEMS),
});

export type Repeatability = z.infer<typeof RepeatabilitySchema>;
export type FeatChoiceOption = z.infer<typeof FeatChoiceOptionSchema>;
export type FeatChoice = z.infer<typeof FeatChoiceSchema>;
export type FeatFeatureBinding = z.infer<typeof FeatFeatureBindingSchema>;
export type FeatFeatureGrant = z.infer<typeof FeatFeatureGrantSchema>;
export type FeatDefinition = z.infer<typeof FeatDefinitionSchema>;
