import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema, type AssetType } from "#src/modules/assets/index";
import { CLASS_MAX_LEVEL } from "#src/modules/classes/domain/entities/ClassesTable";
import {
  ABILITIES,
  DieValueSchema,
  DistanceValueSchema,
  featureKeyDto,
} from "#src/modules/features/index";

/**
 * Schemas of the parts of a class definition. Each part is stored as one jsonb value; rules across
 * parts (unique keys, references by key, level ranges, the subclass choice) are checked by
 * `validateClassDefinition`, references to other assets by the service.
 */

export const COMBINATION_MODES = ["ANY", "ALL"] as const;
export const PROFICIENCY_ACQUISITION_MODES = ["STARTING_CLASS", "MULTICLASS"] as const;
export const PROFICIENCY_TYPES = ["ARMOR", "WEAPON", "TOOL", "SKILL", "SAVING_THROW"] as const;
export const SELECTION_MODES = ["FIXED", "CHOOSE"] as const;
export const EQUIPMENT_OPTION_TYPES = ["EQUIPMENT", "CURRENCY", "MIXED"] as const;
export const EQUIPMENT_ENTRY_TYPES = ["FIXED_ITEM", "ITEM_CHOICE", "TOOL_CHOICE"] as const;
export const CURRENCY_CODES = ["CP", "SP", "EP", "GP", "PP"] as const;
export const TRACK_VALUE_TYPES = ["INTEGER", "DIE", "BONUS", "DISTANCE", "TEXT"] as const;
export const GRANT_OPERATIONS = ["GRANT", "UPGRADE", "REPLACE"] as const;
export const BINDING_SOURCES = ["STATIC", "CLASS_CHOICE", "PROGRESSION_TRACK", "CONTEXT"] as const;
export const CLASS_CHOICE_TYPES = [
  "SKILL_PROFICIENCY",
  "TOOL_PROFICIENCY",
  "EQUIPMENT",
  "FIGHTING_STYLE",
  "WEAPON_MASTERY",
  "EXPERTISE",
  "SUBCLASS",
  "FEAT",
  "SPELL",
  "INVOCATION",
  "METAMAGIC",
  "FEATURE_OPTION",
] as const;
export const REPLACEMENT_POLICIES = ["NONE", "ON_LEVEL_UP", "ON_LONG_REST", "ANY_TIME"] as const;
export const CASTING_TYPES = ["FULL", "HALF", "PACT", "NONE"] as const;
export const PREPARATION_MODES = ["PREPARED", "KNOWN", "SPELLBOOK", "NONE"] as const;
export const RITUAL_MODES = ["NONE", "PREPARED", "SPELLBOOK"] as const;
export const ROUNDING_MODES = ["UP", "DOWN", "NONE"] as const;

export type ClassChoiceType = (typeof CLASS_CHOICE_TYPES)[number];
export type TrackValueType = (typeof TRACK_VALUE_TYPES)[number];
export type CastingType = (typeof CASTING_TYPES)[number];

/**
 * Asset types a choice of this type may offer, as linked options or through its filter. Kept here
 * as data, so rule differences between rulesets (2024 fighting styles are feats) need no code.
 * Empty means codes only.
 */
export const CHOICE_ASSET_TYPES: Record<ClassChoiceType, readonly AssetType[]> = {
  SKILL_PROFICIENCY: [],
  EXPERTISE: [],
  TOOL_PROFICIENCY: ["ITEM"],
  EQUIPMENT: ["ITEM"],
  WEAPON_MASTERY: ["ITEM"],
  FIGHTING_STYLE: ["FEATURE", "FEAT"],
  SUBCLASS: ["SUBCLASS"],
  FEAT: ["FEAT"],
  SPELL: ["SPELL"],
  INVOCATION: ["FEATURE"],
  METAMAGIC: ["FEATURE"],
  FEATURE_OPTION: ["FEATURE"],
};

/** Maximum entries per list part; together with the level count this bounds a definition. */
export const CLASS_PART_MAX_ITEMS = 50;

const classLevelDto = z.number().int().min(1).max(CLASS_MAX_LEVEL);
const displayOrderDto = z.number().int().min(0).max(1_000);
const labelDto = z.string().trim().min(1).max(160);
const codeValueDto = z.string().trim().min(1).max(100);
const abilityDto = z.enum(ABILITIES);

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

const ascendingLevels = (items: readonly { level: number }[]) =>
  items.every((item, index) => index === 0 || item.level > (items[index - 1]?.level ?? 0));

// ---------------------------------------------------------------------------
// Core traits
// ---------------------------------------------------------------------------

export const PrimaryAbilitiesSchema = z
  .strictObject({
    /** ANY: one of them is enough (fighter: STR or DEX); ALL: every one counts (paladin). */
    combinationMode: z.enum(COMBINATION_MODES),
    abilities: z.array(abilityDto).min(1).max(ABILITIES.length),
  })
  .refine((value) => uniqueBy(value.abilities, (ability) => ability), {
    path: ["abilities"],
    message: "Abilities must be unique",
  });

// ---------------------------------------------------------------------------
// Proficiencies
// ---------------------------------------------------------------------------

const proficiencyOptionShape = {
  code: codeValueDto.nullable().default(null),
  assetId: uuidDto.nullable().default(null),
};

/** A code (`light-armor`, `athletics`) or an asset, e.g. a tool item. */
export const ProficiencyOptionSchema = z
  .strictObject(proficiencyOptionShape)
  .refine((option) => (option.code === null) !== (option.assetId === null), {
    message: "An option has either a code or an asset",
  });

const proficiencyRuleShape = {
  key: featureKeyDto,
  acquisitionMode: z.enum(PROFICIENCY_ACQUISITION_MODES),
  proficiencyType: z.enum(PROFICIENCY_TYPES),
  selectionMode: z.enum(SELECTION_MODES),
  choiceCount: z.number().int().min(1).max(50).nullable().default(null),
  displayOrder: displayOrderDto,
};

/**
 * Rules as stored, without the checks; for the player view, which leaves out options the player
 * may not see.
 */
export const ProficiencyRuleViewSchema = z.strictObject({
  ...proficiencyRuleShape,
  options: z.array(z.strictObject(proficiencyOptionShape)),
});

export const ProficiencyRuleSchema = z
  .strictObject({
    ...proficiencyRuleShape,
    options: z.array(ProficiencyOptionSchema).min(1).max(100),
  })
  .superRefine((rule, ctx) => {
    if (rule.selectionMode === "FIXED" && rule.choiceCount !== null) {
      ctx.addIssue({ code: "custom", path: ["choiceCount"], message: "Fixed rules have no choice count" });
    }

    if (rule.selectionMode === "CHOOSE") {
      if (rule.choiceCount === null) {
        ctx.addIssue({ code: "custom", path: ["choiceCount"], message: "A choice needs a count" });
      } else if (rule.choiceCount > rule.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["choiceCount"],
          message: "A choice cannot require more options than it offers",
        });
      }
    }

    if (!uniqueBy(rule.options, (option) => option.code ?? option.assetId ?? "")) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be unique" });
    }
  });

// ---------------------------------------------------------------------------
// Starting equipment
// ---------------------------------------------------------------------------

export const EquipmentFilterSchema = z.strictObject({
  /** Codes of item categories, e.g. `martial-weapon`, `artisan-tool`. */
  categories: z.array(codeValueDto).max(20).default([]),
  /** Item codes that may be chosen; empty means every item of the categories. */
  codes: z.array(codeValueDto).max(100).default([]),
});

const equipmentEntryShape = {
  entryType: z.enum(EQUIPMENT_ENTRY_TYPES),
  itemAssetId: uuidDto.nullable().default(null),
  quantity: z.number().int().min(1).max(1_000).default(1),
  /** Entries of one option with the same group are alternatives. */
  choiceGroup: featureKeyDto.nullable().default(null),
  choiceCount: z.number().int().min(1).max(50).nullable().default(null),
  typedFilter: EquipmentFilterSchema.nullable().default(null),
};

export const EquipmentEntrySchema = z
  .strictObject(equipmentEntryShape)
  .superRefine((entry, ctx) => {
    if (entry.entryType === "FIXED_ITEM") {
      if (entry.itemAssetId === null) {
        ctx.addIssue({ code: "custom", path: ["itemAssetId"], message: "A fixed item needs an item" });
      }

      if (entry.choiceCount !== null || entry.typedFilter !== null) {
        ctx.addIssue({
          code: "custom",
          path: ["entryType"],
          message: "A fixed item has no choice count or filter",
        });
      }

      return;
    }

    if (entry.itemAssetId !== null) {
      ctx.addIssue({ code: "custom", path: ["itemAssetId"], message: "A choice has no fixed item" });
    }

    if (entry.typedFilter === null || entry.choiceCount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["typedFilter"],
        message: "A choice needs a filter and a choice count",
      });
    }
  });

const startingEquipmentOptionShape = {
  code: featureKeyDto,
  name: labelDto,
  optionType: z.enum(EQUIPMENT_OPTION_TYPES),
  currencyAmount: z.number().int().min(1).max(100_000).nullable().default(null),
  currencyCode: z.enum(CURRENCY_CODES).nullable().default(null),
  displayOrder: displayOrderDto,
};

/** Options as stored, without the checks; the player view hides items the player may not see. */
export const StartingEquipmentOptionViewSchema = z.strictObject({
  ...startingEquipmentOptionShape,
  entries: z.array(z.strictObject(equipmentEntryShape)),
});

export const StartingEquipmentOptionSchema = z
  .strictObject({
    ...startingEquipmentOptionShape,
    entries: z.array(EquipmentEntrySchema).max(CLASS_PART_MAX_ITEMS).default([]),
  })
  .superRefine((option, ctx) => {
    const hasCurrency = option.currencyAmount !== null || option.currencyCode !== null;

    if ((option.currencyAmount === null) !== (option.currencyCode === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["currencyAmount"],
        message: "Currency needs both amount and code",
      });
    }

    if (option.optionType !== "EQUIPMENT" && !hasCurrency) {
      ctx.addIssue({ code: "custom", path: ["currencyAmount"], message: "This option needs currency" });
    }

    if (option.optionType === "EQUIPMENT" && hasCurrency) {
      ctx.addIssue({ code: "custom", path: ["currencyAmount"], message: "Equipment options have no currency" });
    }

    if (option.optionType !== "CURRENCY" && option.entries.length === 0) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "This option needs entries" });
    }

    if (option.optionType === "CURRENCY" && option.entries.length > 0) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "Currency options have no entries" });
    }
  });

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

const TRACK_VALUE_SCHEMAS: Record<TrackValueType, z.ZodType> = {
  INTEGER: z.number().int().min(-1_000_000).max(1_000_000),
  BONUS: z.number().int().min(-100).max(100),
  DIE: DieValueSchema,
  DISTANCE: DistanceValueSchema,
  TEXT: z.string().trim().min(1).max(200),
};

export const ProgressionValueSchema = z.strictObject({
  level: classLevelDto,
  value: z.json(),
});

/** A column of the class table, e.g. rages, rage damage, martial arts die. */
export const ProgressionTrackSchema = z
  .strictObject({
    key: featureKeyDto,
    label: labelDto,
    valueType: z.enum(TRACK_VALUE_TYPES),
    unit: z.string().trim().min(1).max(20).nullable().default(null),
    displayOrder: displayOrderDto,
    /** At most one value per level; a level without a value shows nothing. */
    values: z.array(ProgressionValueSchema).max(CLASS_MAX_LEVEL).default([]),
  })
  .superRefine((track, ctx) => {
    if (!ascendingLevels(track.values)) {
      ctx.addIssue({ code: "custom", path: ["values"], message: "Levels must be unique and ascending" });
    }

    track.values.forEach((entry, index) => {
      const result = TRACK_VALUE_SCHEMAS[track.valueType].safeParse(entry.value);

      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: ["values", index, "value"],
          message: `Value does not fit ${track.valueType}`,
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// Feature grants and levels
// ---------------------------------------------------------------------------

/** Where the value of a feature parameter comes from when the class grants the feature. */
export const FeatureBindingSchema = z
  .strictObject({
    parameterKey: featureKeyDto,
    bindingSource: z.enum(BINDING_SOURCES),
    staticValue: z.json().nullable().default(null),
    choiceKey: featureKeyDto.nullable().default(null),
    trackKey: featureKeyDto.nullable().default(null),
    contextKey: z.string().min(1).max(100).nullable().default(null),
  })
  .superRefine((binding, ctx) => {
    const set = {
      STATIC: binding.staticValue !== null,
      CLASS_CHOICE: binding.choiceKey !== null,
      PROGRESSION_TRACK: binding.trackKey !== null,
      CONTEXT: binding.contextKey !== null,
    };
    const others = Object.entries(set).filter(
      ([source, present]) => source !== binding.bindingSource && present,
    );

    if (!set[binding.bindingSource] || others.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["bindingSource"],
        message: "A binding sets exactly the value of its source",
      });
    }
  });

export const FeatureGrantSchema = z
  .strictObject({
    key: featureKeyDto,
    featureAssetId: uuidDto,
    grantOperation: z.enum(GRANT_OPERATIONS),
    /** The feature an upgrade or replacement applies to. */
    targetFeatureAssetId: uuidDto.nullable().default(null),
    isRequired: z.boolean().default(true),
    /** Only granted when this choice selects it; see `validateClassDefinition`. */
    choiceKey: featureKeyDto.nullable().default(null),
    displayOrder: displayOrderDto,
    bindings: z.array(FeatureBindingSchema).max(20).default([]),
  })
  .superRefine((grant, ctx) => {
    if (grant.grantOperation === "GRANT" && grant.targetFeatureAssetId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "Plain grants have no target",
      });
    }

    if (grant.grantOperation !== "GRANT") {
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

export const ClassLevelSchema = z.strictObject({
  level: classLevelDto,
  featureGrants: z.array(FeatureGrantSchema).max(30).default([]),
});

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

export const ClassChoiceOptionSchema = z.strictObject({
  code: featureKeyDto,
  label: labelDto,
  linkedAssetId: uuidDto.nullable().default(null),
});

const classChoiceShape = {
  key: featureKeyDto,
  /** Level the choice is made at; null for choices at the start (skills, equipment). */
  level: classLevelDto.nullable().default(null),
  /** The grant whose feature asks for this choice, e.g. Fighting Style. */
  grantKey: featureKeyDto.nullable().default(null),
  choiceType: z.enum(CLASS_CHOICE_TYPES),
  minimumSelections: z.number().int().min(0).max(50),
  maximumSelections: z.number().int().min(1).max(50),
  replacementPolicy: z.enum(REPLACEMENT_POLICIES).default("NONE"),
  optionFilter: z
    .strictObject({ assetTypes: z.array(AssetBaseSchema.shape.assetType).min(1).max(5) })
    .nullable()
    .default(null),
  displayOrder: displayOrderDto,
  options: z.array(ClassChoiceOptionSchema).max(100).default([]),
};

/**
 * Choices as stored, without the checks; for the player view, which leaves out options the player
 * may not see, so a choice may have fewer options than it requires there.
 */
export const ClassChoiceViewSchema = z.strictObject(classChoiceShape);

export const ClassChoiceSchema = z
  .strictObject(classChoiceShape)
  .superRefine((choice, ctx) => {
    const allowed = CHOICE_ASSET_TYPES[choice.choiceType];

    if (choice.minimumSelections > choice.maximumSelections) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumSelections"],
        message: "The minimum cannot exceed the maximum",
      });
    }

    if (choice.options.length === 0 && choice.optionFilter === null) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "A choice needs options or a filter" });
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

    choice.optionFilter?.assetTypes.forEach((type, index) => {
      if (!allowed.includes(type)) {
        ctx.addIssue({
          code: "custom",
          path: ["optionFilter", "assetTypes", index],
          message: `${choice.choiceType} choices cannot offer ${type}`,
        });
      }
    });

    choice.options.forEach((option, index) => {
      if (option.linkedAssetId !== null && allowed.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "linkedAssetId"],
          message: `${choice.choiceType} choices offer codes only`,
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// Spellcasting and multiclassing
// ---------------------------------------------------------------------------

const countDto = z.number().int().min(0).max(100).nullable().default(null);

export const SpellcastingLevelSchema = z
  .strictObject({
    level: classLevelDto,
    cantripsKnown: countDto,
    spellsKnown: countDto,
    preparedSpells: countDto,
    /** Slots per spell level 1..9 for a single-class caster. */
    spellSlots: z.array(z.number().int().min(0).max(20)).max(9).default([]),
    pactSlots: z.number().int().min(1).max(10).nullable().default(null),
    pactSlotLevel: z.number().int().min(1).max(9).nullable().default(null),
  })
  .refine((entry) => (entry.pactSlots === null) === (entry.pactSlotLevel === null), {
    path: ["pactSlots"],
    message: "Pact slots need both count and level",
  });

export const SpellcastingProfileSchema = z
  .strictObject({
    castingType: z.enum(CASTING_TYPES),
    spellcastingAbility: abilityDto.nullable().default(null),
    unlockLevel: classLevelDto.nullable().default(null),
    preparationMode: z.enum(PREPARATION_MODES),
    spellListAssetId: uuidDto.nullable().default(null),
    ritualMode: z.enum(RITUAL_MODES).nullable().default(null),
    /** Share of the class level that counts for multiclass spell slots, e.g. 1/2 for half casters. */
    multiclassNumerator: z.number().int().min(1).max(10).nullable().default(null),
    multiclassDenominator: z.number().int().min(1).max(10).nullable().default(null),
    multiclassRounding: z.enum(ROUNDING_MODES).nullable().default(null),
    levels: z.array(SpellcastingLevelSchema).max(CLASS_MAX_LEVEL).default([]),
  })
  .superRefine((profile, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const hasFraction =
      profile.multiclassNumerator !== null || profile.multiclassDenominator !== null;

    if (profile.castingType === "NONE") {
      if (
        profile.spellcastingAbility !== null ||
        profile.unlockLevel !== null ||
        profile.preparationMode !== "NONE" ||
        profile.spellListAssetId !== null ||
        profile.ritualMode !== null ||
        hasFraction ||
        profile.multiclassRounding !== null ||
        profile.levels.length > 0
      ) {
        issue("castingType", "Classes without spellcasting have no further spellcasting values");
      }

      return;
    }

    if (profile.spellcastingAbility === null) {
      issue("spellcastingAbility", "Spellcasting needs an ability");
    }

    if (profile.unlockLevel === null) {
      issue("unlockLevel", "Spellcasting needs an unlock level");
    }

    if (profile.preparationMode === "NONE") {
      issue("preparationMode", "Spellcasting needs a preparation mode");
    }

    if ((profile.multiclassNumerator === null) !== (profile.multiclassDenominator === null)) {
      issue("multiclassNumerator", "The multiclass share needs numerator and denominator");
    }

    if (profile.castingType === "PACT" && (hasFraction || profile.multiclassRounding !== null)) {
      issue("multiclassNumerator", "Pact magic does not count towards multiclass spell slots");
    }

    if (profile.castingType !== "PACT") {
      if (!hasFraction || profile.multiclassRounding === null) {
        issue("multiclassNumerator", "Full and half casters need a multiclass share and rounding");
      } else if (
        profile.multiclassNumerator !== null &&
        profile.multiclassDenominator !== null &&
        profile.multiclassNumerator > profile.multiclassDenominator
      ) {
        issue("multiclassNumerator", "The multiclass share cannot exceed 1");
      }
    }

    if (!ascendingLevels(profile.levels)) {
      issue("levels", "Levels must be unique and ascending");
    }

    profile.levels.forEach((entry, index) => {
      const path = ["levels", index];

      if (profile.unlockLevel !== null && entry.level < profile.unlockLevel) {
        ctx.addIssue({ code: "custom", path, message: "Spellcasting starts at the unlock level" });
      }

      if (profile.castingType === "PACT" && entry.spellSlots.length > 0) {
        ctx.addIssue({ code: "custom", path: [...path, "spellSlots"], message: "Pact casters use pact slots" });
      }

      if (profile.castingType !== "PACT" && entry.pactSlots !== null) {
        ctx.addIssue({ code: "custom", path: [...path, "pactSlots"], message: "Only pact casters have pact slots" });
      }
    });
  });

export const MulticlassRulesSchema = z
  .strictObject({
    /** ALL: every requirement must be met; ANY: one is enough (fighter: STR 13 or DEX 13). */
    combinationMode: z.enum(COMBINATION_MODES).default("ALL"),
    abilityRequirements: z
      .array(z.strictObject({ ability: abilityDto, minimum: z.number().int().min(1).max(30) }))
      .max(ABILITIES.length)
      .default([]),
  })
  .refine((value) => uniqueBy(value.abilityRequirements, (item) => item.ability), {
    path: ["abilityRequirements"],
    message: "One requirement per ability",
  });

// ---------------------------------------------------------------------------
// Whole definition
// ---------------------------------------------------------------------------

export const ClassDefinitionSchema = z.strictObject({
  primaryAbilities: PrimaryAbilitiesSchema,
  proficiencies: z.array(ProficiencyRuleSchema).max(CLASS_PART_MAX_ITEMS),
  startingEquipment: z.array(StartingEquipmentOptionSchema).max(10),
  progressionTracks: z.array(ProgressionTrackSchema).max(CLASS_PART_MAX_ITEMS),
  levels: z.array(ClassLevelSchema).min(1).max(CLASS_MAX_LEVEL),
  choices: z.array(ClassChoiceSchema).max(CLASS_PART_MAX_ITEMS * 2),
  spellcasting: SpellcastingProfileSchema.nullable(),
  multiclass: MulticlassRulesSchema,
});

export type PrimaryAbilities = z.infer<typeof PrimaryAbilitiesSchema>;
export type ProficiencyRule = z.infer<typeof ProficiencyRuleSchema>;
export type StartingEquipmentOption = z.infer<typeof StartingEquipmentOptionSchema>;
export type ProgressionTrack = z.infer<typeof ProgressionTrackSchema>;
export type FeatureBinding = z.infer<typeof FeatureBindingSchema>;
export type FeatureGrant = z.infer<typeof FeatureGrantSchema>;
export type ClassLevel = z.infer<typeof ClassLevelSchema>;
export type ClassChoice = z.infer<typeof ClassChoiceSchema>;
export type SpellcastingProfile = z.infer<typeof SpellcastingProfileSchema>;
export type MulticlassRules = z.infer<typeof MulticlassRulesSchema>;
export type ClassDefinition = z.infer<typeof ClassDefinitionSchema>;
