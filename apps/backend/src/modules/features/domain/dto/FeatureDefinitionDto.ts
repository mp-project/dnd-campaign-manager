import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import {
  DIE_FACES,
  effectPayloadSchema,
  predicateExpressionSchema,
  valueExpressionSchema,
} from "#core/rules/contracts";
import { AssetBaseSchema } from "#src/modules/assets/index";

/**
 * Schemas of the parts of a feature definition. Each part is stored as one jsonb array; the rules
 * across parts (unique keys, references between parts, allowed variables) are checked by
 * `validateFeatureDefinition`.
 */

export const PARAMETER_VALUE_TYPES = [
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DIE",
  "DISTANCE",
  "TEXT",
  "ASSET_REF",
] as const;

export const SCALING_VALUE_TYPES = ["INTEGER", "DECIMAL", "DIE", "DISTANCE", "TEXT"] as const;
export const SCALE_BY = ["CHARACTER_LEVEL", "CLASS_LEVEL", "SOURCE_LEVEL"] as const;
export const CHOICE_TYPES = [
  "OPTION",
  "ASSET",
  "PROFICIENCY",
  "LANGUAGE",
  "ABILITY",
  "OTHER",
] as const;
export const RESOURCE_RECOVERIES = ["SHORT_REST", "LONG_REST", "DAWN", "MANUAL", "NONE"] as const;
export const ACTIVATION_TYPES = ["ACTION", "BONUS_ACTION", "REACTION", "FREE", "PASSIVE"] as const;
export const ACTIVATION_COST_TYPES = ["RESOURCE", "SPELL_SLOT", "ITEM", "OTHER"] as const;
export const DURATION_UNITS = [
  "INSTANT",
  "ROUND",
  "MINUTE",
  "HOUR",
  "DAY",
  "UNTIL_SHORT_REST",
  "UNTIL_LONG_REST",
  "PERMANENT",
  "SPECIAL",
] as const;
export const SUPERSEDE_MODES = ["UPGRADE", "REPLACE"] as const;

/** Maximum entries per part; together with the expression limits this bounds a definition. */
export const FEATURE_PART_MAX_ITEMS = 50;
export const FEATURE_SECTION_CONTENT_MAX_LENGTH = 20_000;
export const MAX_LEVEL = 30;

export type ParameterValueType = (typeof PARAMETER_VALUE_TYPES)[number];
export type ScalingValueType = (typeof SCALING_VALUE_TYPES)[number];

/** Lower-case key, usable in variable names such as `param.<key>` and `scale.<key>`. */
export const featureKeyDto = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, { message: "Keys use a-z, 0-9 and _ and start with a letter" });

export const DieValueSchema = z.strictObject({
  count: z.number().int().min(1).max(100),
  faces: z.literal([...DIE_FACES]),
});

export const DistanceValueSchema = z.strictObject({
  amount: z.number().finite().min(0).max(100_000),
  unit: z.enum(["ft", "m"]),
});

const VALUE_SCHEMAS: Record<ParameterValueType, z.ZodType> = {
  INTEGER: z.number().int().min(-1_000_000).max(1_000_000),
  DECIMAL: z.number().finite().min(-1_000_000).max(1_000_000),
  BOOLEAN: z.boolean(),
  DIE: DieValueSchema,
  DISTANCE: DistanceValueSchema,
  TEXT: z.string().trim().min(1).max(500),
  ASSET_REF: uuidDto,
};

/** Checks a stored or bound value against its type; returns the issue messages. */
export function checkTypedValue(valueType: ParameterValueType, value: unknown): string[] {
  const result = VALUE_SCHEMAS[valueType].safeParse(value);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

export type DieValue = z.infer<typeof DieValueSchema>;
export type DistanceValue = z.infer<typeof DistanceValueSchema>;

/** Any JSON value; the type of a parameter or scaling value decides what is allowed. */
const jsonValueDto = z.json();

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

export const FeatureSectionSchema = z.strictObject({
  key: featureKeyDto,
  title: z.string().trim().min(1).max(160),
  /** Markdown, rendered safely into `contentHtml` of the response. */
  content: z.string().max(FEATURE_SECTION_CONTENT_MAX_LENGTH),
  displayOrder: z.number().int().min(0).max(1_000),
});

export const FeatureParameterSchema = z
  .strictObject({
    key: featureKeyDto,
    valueType: z.enum(PARAMETER_VALUE_TYPES),
    required: z.boolean().default(false),
    defaultValue: jsonValueDto.nullable().default(null),
  })
  .superRefine((parameter, ctx) => {
    if (parameter.defaultValue === null) {
      return;
    }

    for (const message of checkTypedValue(parameter.valueType, parameter.defaultValue)) {
      ctx.addIssue({ code: "custom", path: ["defaultValue"], message });
    }
  });

export const ChoiceOptionFilterSchema = z.strictObject({
  /** Assets of these types available in the campaign may be chosen instead of fixed options. */
  assetTypes: z.array(AssetBaseSchema.shape.assetType).min(1).max(10),
});

export const FeatureChoiceOptionSchema = z.strictObject({
  code: featureKeyDto,
  label: z.string().trim().min(1).max(160),
  value: jsonValueDto.nullable().default(null),
  linkedAssetId: uuidDto.nullable().default(null),
});

const featureChoiceShape = {
  key: featureKeyDto,
  choiceType: z.enum(CHOICE_TYPES),
  minimumSelections: z.number().int().min(0).max(50),
  maximumSelections: z.number().int().min(1).max(50),
  optionFilter: ChoiceOptionFilterSchema.nullable().default(null),
  displayOrder: z.number().int().min(0).max(1_000),
  options: z.array(FeatureChoiceOptionSchema).max(100).default([]),
};

/**
 * Choices as stored, without the checks; for the player view, which leaves out options the player
 * may not see, so a choice may have fewer options than it requires there.
 */
export const FeatureChoiceViewSchema = z.strictObject(featureChoiceShape);

export const FeatureChoiceSchema = z
  .strictObject(featureChoiceShape)
  .superRefine((choice, ctx) => {
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
  });

export const FeatureResourceSchema = z.strictObject({
  key: featureKeyDto,
  name: z.string().trim().min(1).max(160),
  maximumExpression: valueExpressionSchema,
  recovery: z.enum(RESOURCE_RECOVERIES),
});

export const FeatureScalingValueSchema = z.strictObject({
  minimumLevel: z.number().int().min(1).max(MAX_LEVEL),
  value: jsonValueDto,
});

export const FeatureScalingTrackSchema = z
  .strictObject({
    key: featureKeyDto,
    valueType: z.enum(SCALING_VALUE_TYPES),
    scaleBy: z.enum(SCALE_BY),
    values: z.array(FeatureScalingValueSchema).min(1).max(MAX_LEVEL),
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

export const FeatureDurationSchema = z.strictObject({
  unit: z.enum(DURATION_UNITS),
  amount: valueExpressionSchema.nullable().default(null),
});

export const FeatureActivationCostSchema = z
  .strictObject({
    costType: z.enum(ACTIVATION_COST_TYPES),
    resourceKey: featureKeyDto.nullable().default(null),
    amountExpression: valueExpressionSchema,
  })
  .superRefine((cost, ctx) => {
    if ((cost.costType === "RESOURCE") !== (cost.resourceKey !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["resourceKey"],
        message: "Resource costs, and only they, name a resource",
      });
    }
  });

export const FeatureActivationSchema = z.strictObject({
  key: featureKeyDto,
  activationType: z.enum(ACTIVATION_TYPES),
  trigger: z.string().trim().min(1).max(500).nullable().default(null),
  duration: FeatureDurationSchema.nullable().default(null),
  concentration: z.boolean().default(false),
  costs: z.array(FeatureActivationCostSchema).max(10).default([]),
});

export const FeatureEffectSchema = z.strictObject({
  key: featureKeyDto,
  /** Effects without activation always apply while their condition holds. */
  activationKey: featureKeyDto.nullable().default(null),
  condition: predicateExpressionSchema.nullable().default(null),
  payload: effectPayloadSchema,
  displayOrder: z.number().int().min(0).max(1_000),
});

export const FeatureSupersedeSchema = z.strictObject({
  targetAssetId: uuidDto,
  /** `REPLACE` drops the target, `UPGRADE` drops its effects but keeps choices and resources. */
  mode: z.enum(SUPERSEDE_MODES),
});

const part = <T extends z.ZodType>(item: T) => z.array(item).max(FEATURE_PART_MAX_ITEMS);

export const FeatureGraphSchema = z.strictObject({
  sections: part(FeatureSectionSchema),
  parameters: part(FeatureParameterSchema),
  choices: part(FeatureChoiceSchema),
  resources: part(FeatureResourceSchema),
  scalingTracks: part(FeatureScalingTrackSchema),
  activations: part(FeatureActivationSchema),
  effects: part(FeatureEffectSchema),
  supersedes: z.array(FeatureSupersedeSchema).max(20),
});

export type FeatureSection = z.infer<typeof FeatureSectionSchema>;
export type FeatureParameter = z.infer<typeof FeatureParameterSchema>;
export type FeatureChoice = z.infer<typeof FeatureChoiceSchema>;
export type FeatureChoiceOption = z.infer<typeof FeatureChoiceOptionSchema>;
export type FeatureResource = z.infer<typeof FeatureResourceSchema>;
export type FeatureScalingTrack = z.infer<typeof FeatureScalingTrackSchema>;
export type FeatureActivation = z.infer<typeof FeatureActivationSchema>;
export type FeatureEffect = z.infer<typeof FeatureEffectSchema>;
export type FeatureSupersede = z.infer<typeof FeatureSupersedeSchema>;
export type FeatureGraph = z.infer<typeof FeatureGraphSchema>;
