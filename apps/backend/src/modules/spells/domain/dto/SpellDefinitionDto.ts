import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { effectPayloadSchema, predicateExpressionSchema } from "#core/rules/contracts";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ABILITIES, checkTypedValue, featureKeyDto } from "#src/modules/features/index";
import { SPELL_LIST_MAX_ENTRIES } from "#src/modules/spells/domain/entities/SpellsTable";

/**
 * Schemas of the parts of a spell definition. Each part is stored as one jsonb array; the rules
 * across parts and the core fields (keys, references between parts, allowed variables, slot
 * scaling not below the spell level …) are checked by `validateSpellDefinition`.
 */

export const REQUIREMENT_TYPES = ["FOCUS", "FREE_HAND", "SPECIAL"] as const;
export const CURRENCY_CODES = ["CP", "SP", "EP", "GP", "PP"] as const;
export const TARGET_TYPES = ["SELF", "CREATURE", "OBJECT", "POINT", "AREA"] as const;
export const AREA_SHAPES = ["CONE", "CUBE", "CYLINDER", "EMANATION", "LINE", "SPHERE"] as const;
export const AREA_UNITS = ["FEET", "METERS"] as const;
export const SPELL_CHOICE_TYPES = ["OPTION", "DAMAGE_TYPE", "ASSET", "OTHER"] as const;
export const SPELL_SCALE_BY = ["CHARACTER_LEVEL", "SLOT_LEVEL"] as const;
export const SPELL_SCALING_VALUE_TYPES = ["INTEGER", "DECIMAL", "DIE", "DISTANCE", "TEXT"] as const;
export const EFFECT_RESOLUTIONS = [
  "AUTOMATIC",
  "MELEE_SPELL_ATTACK",
  "RANGED_SPELL_ATTACK",
  "SAVING_THROW",
] as const;
export const SAVE_OUTCOMES = ["NO_EFFECT", "HALF", "PARTIAL"] as const;

/** Maximum entries per part; together with the expression limits this bounds a definition. */
export const SPELL_PART_MAX_ITEMS = 50;
export const SPELL_SECTION_CONTENT_MAX_LENGTH = 20_000;
/** Character levels for `CHARACTER_LEVEL` scaling. */
export const SPELL_MAX_CHARACTER_LEVEL = 20;

export type SpellScalingValueType = (typeof SPELL_SCALING_VALUE_TYPES)[number];

const labelDto = z.string().trim().min(1).max(160);
const displayOrderDto = z.number().int().min(0).max(1_000);
const detailDto = z.string().trim().min(1).max(500);

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

export const SpellSectionSchema = z.strictObject({
  key: featureKeyDto,
  title: labelDto,
  /** Markdown, rendered safely into `contentHtml` of the response. */
  content: z.string().max(SPELL_SECTION_CONTENT_MAX_LENGTH),
  displayOrder: displayOrderDto,
});

/**
 * A material component. A component with a cost can't be replaced by a focus or component pouch,
 * and only such components are consumed by the spell.
 */
export const SpellMaterialSchema = z
  .strictObject({
    description: detailDto,
    costAmount: z.number().finite().positive().max(10_000_000).nullable().default(null),
    currency: z.enum(CURRENCY_CODES).nullable().default(null),
    consumed: z.boolean().default(false),
    replaceableByFocus: z.boolean().default(false),
  })
  .superRefine((material, ctx) => {
    if ((material.costAmount === null) !== (material.currency === null)) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "A cost needs an amount and a currency" });
    }

    if (material.costAmount !== null && material.replaceableByFocus) {
      ctx.addIssue({
        code: "custom",
        path: ["replaceableByFocus"],
        message: "A component with a cost can't be replaced by a focus",
      });
    }

    if (material.consumed && material.costAmount === null) {
      ctx.addIssue({ code: "custom", path: ["consumed"], message: "Only components with a cost are consumed" });
    }
  });

/** Requirements besides the V/S/M components, such as a free hand or a specific focus. */
export const SpellRequirementSchema = z
  .strictObject({
    type: z.enum(REQUIREMENT_TYPES),
    details: detailDto.nullable().default(null),
  })
  .refine((requirement) => requirement.type !== "SPECIAL" || requirement.details !== null, {
    path: ["details"],
    message: "A special requirement needs details",
  });

export const SpellAreaSchema = z
  .strictObject({
    shape: z.enum(AREA_SHAPES),
    /** Radius of spheres, cylinders and emanations; length of cones and lines; edge of cubes. */
    size: z.number().finite().positive().max(100_000),
    unit: z.enum(AREA_UNITS),
    /** Cylinders only. */
    height: z.number().finite().positive().max(100_000).nullable().default(null),
    /** Lines only. */
    width: z.number().finite().positive().max(100_000).nullable().default(null),
  })
  .superRefine((area, ctx) => {
    if ((area.shape === "CYLINDER") !== (area.height !== null)) {
      ctx.addIssue({ code: "custom", path: ["height"], message: "Cylinders, and only they, have a height" });
    }

    if ((area.shape === "LINE") !== (area.width !== null)) {
      ctx.addIssue({ code: "custom", path: ["width"], message: "Lines, and only they, have a width" });
    }
  });

export const SpellTargetSchema = z
  .strictObject({
    key: featureKeyDto,
    targetType: z.enum(TARGET_TYPES),
    /** How many targets; null when the spell sets no number (self, every creature in an area). */
    minimumCount: z.number().int().min(1).max(100).nullable().default(null),
    maximumCount: z.number().int().min(1).max(100).nullable().default(null),
    area: SpellAreaSchema.nullable().default(null),
    description: detailDto.nullable().default(null),
  })
  .superRefine((target, ctx) => {
    if (target.targetType === "AREA" && target.area === null) {
      ctx.addIssue({ code: "custom", path: ["area"], message: "An area target needs an area" });
    }

    if ((target.targetType === "CREATURE" || target.targetType === "OBJECT") && target.area !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["area"],
        message: "Creatures and objects are targeted one by one; use an AREA target for an area",
      });
    }

    if (target.targetType === "SELF" && (target.minimumCount !== null || target.maximumCount !== null)) {
      ctx.addIssue({ code: "custom", path: ["minimumCount"], message: "The caster is a single target" });
    }

    if (
      target.minimumCount !== null &&
      target.maximumCount !== null &&
      target.minimumCount > target.maximumCount
    ) {
      ctx.addIssue({ code: "custom", path: ["minimumCount"], message: "The minimum cannot exceed the maximum" });
    }
  });

export const SpellChoiceOptionSchema = z.strictObject({
  code: featureKeyDto,
  label: labelDto,
  linkedAssetId: uuidDto.nullable().default(null),
});

const spellChoiceShape = {
  key: featureKeyDto,
  label: labelDto,
  choiceType: z.enum(SPELL_CHOICE_TYPES),
  minimumSelections: z.number().int().min(0).max(50),
  maximumSelections: z.number().int().min(1).max(50),
  /** Assets of these types available in the campaign may be chosen instead of fixed options. */
  optionFilter: z
    .strictObject({ assetTypes: z.array(AssetBaseSchema.shape.assetType).min(1).max(10) })
    .nullable()
    .default(null),
  displayOrder: displayOrderDto,
  options: z.array(SpellChoiceOptionSchema).max(100).default([]),
};

/**
 * Choices as stored, without the checks; for the player view, which leaves out options the player
 * may not see, so a choice may have fewer options than it requires there.
 */
export const SpellChoiceViewSchema = z.strictObject(spellChoiceShape);

export const SpellChoiceSchema = z.strictObject(spellChoiceShape).superRefine((choice, ctx) => {
  if (choice.minimumSelections > choice.maximumSelections) {
    ctx.addIssue({ code: "custom", path: ["minimumSelections"], message: "The minimum cannot exceed the maximum" });
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
});

export const SpellScalingValueSchema = z.strictObject({
  /** Character level or slot level from which the value applies. */
  minimumLevel: z.number().int().min(1).max(SPELL_MAX_CHARACTER_LEVEL),
  value: z.json(),
});

/**
 * Values that grow with the character level (cantrip damage dice) or the slot level. Expressions
 * use them as `scale.<key>` (numbers) or as dice `scale.<key>`; a value grows linearly per slot
 * level with the variable `slot.above` instead.
 */
export const SpellScalingTrackSchema = z
  .strictObject({
    key: featureKeyDto,
    scaleBy: z.enum(SPELL_SCALE_BY),
    valueType: z.enum(SPELL_SCALING_VALUE_TYPES),
    values: z.array(SpellScalingValueSchema).min(1).max(SPELL_MAX_CHARACTER_LEVEL),
  })
  .superRefine((track, ctx) => {
    track.values.forEach((step, index) => {
      const previous = track.values[index - 1];

      if (previous && step.minimumLevel <= previous.minimumLevel) {
        ctx.addIssue({
          code: "custom",
          path: ["values", index, "minimumLevel"],
          message: "Scaling levels must be unique and ascending",
        });
      }

      for (const message of checkTypedValue(track.valueType, step.value)) {
        ctx.addIssue({ code: "custom", path: ["values", index, "value"], message });
      }
    });
  });

/**
 * What the spell does. `resolution` says how a target resists (attack roll, saving throw or not at
 * all); `dependsOnEffectKeys` names effects that must have applied first (a rider on a hit).
 */
export const SpellEffectSchema = z
  .strictObject({
    key: featureKeyDto,
    targetKey: featureKeyDto.nullable().default(null),
    resolution: z.enum(EFFECT_RESOLUTIONS).default("AUTOMATIC"),
    saveAbility: z.enum(ABILITIES).nullable().default(null),
    onSave: z.enum(SAVE_OUTCOMES).nullable().default(null),
    dependsOnEffectKeys: z.array(featureKeyDto).max(10).default([]),
    condition: predicateExpressionSchema.nullable().default(null),
    payload: effectPayloadSchema,
    displayOrder: displayOrderDto,
  })
  .superRefine((effect, ctx) => {
    const save = effect.resolution === "SAVING_THROW";

    if (save !== (effect.saveAbility !== null)) {
      ctx.addIssue({ code: "custom", path: ["saveAbility"], message: "Saving throws, and only they, name an ability" });
    }

    if (save !== (effect.onSave !== null)) {
      ctx.addIssue({ code: "custom", path: ["onSave"], message: "Saving throws, and only they, say what a success does" });
    }

    if (!uniqueBy(effect.dependsOnEffectKeys, (key) => key)) {
      ctx.addIssue({ code: "custom", path: ["dependsOnEffectKeys"], message: "Keys must be unique" });
    }
  });

const part = <T extends z.ZodType>(item: T) => z.array(item).max(SPELL_PART_MAX_ITEMS);

export const SpellDefinitionSchema = z.strictObject({
  sections: part(SpellSectionSchema),
  materials: z.array(SpellMaterialSchema).max(10),
  requirements: z.array(SpellRequirementSchema).max(10),
  targets: part(SpellTargetSchema),
  choices: part(SpellChoiceSchema),
  scalingTracks: part(SpellScalingTrackSchema),
  effects: part(SpellEffectSchema),
});

/** Asset ids of spell lists; unique. */
export const SpellListIdsSchema = z
  .array(uuidDto)
  .max(50)
  .refine((ids) => uniqueBy(ids, (id) => id), { message: "Spell lists must be unique" });

/** Asset ids of the spells of a list; unique. */
export const SpellListEntriesSchema = z
  .array(uuidDto)
  .max(SPELL_LIST_MAX_ENTRIES)
  .refine((ids) => uniqueBy(ids, (id) => id), { message: "Spells must be unique" });

export type SpellSection = z.infer<typeof SpellSectionSchema>;
export type SpellMaterial = z.infer<typeof SpellMaterialSchema>;
export type SpellRequirement = z.infer<typeof SpellRequirementSchema>;
export type SpellTarget = z.infer<typeof SpellTargetSchema>;
export type SpellChoice = z.infer<typeof SpellChoiceSchema>;
export type SpellScalingTrack = z.infer<typeof SpellScalingTrackSchema>;
export type SpellEffect = z.infer<typeof SpellEffectSchema>;
export type SpellDefinition = z.infer<typeof SpellDefinitionSchema>;
