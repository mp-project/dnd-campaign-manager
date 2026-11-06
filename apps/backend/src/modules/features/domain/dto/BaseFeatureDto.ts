import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { FeatureGraphSchema } from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import {
  FEATURE_DESCRIPTION_MAX_LENGTH,
  FEATURE_STACKING_MODES,
  FEATURE_TYPES,
} from "#src/modules/features/domain/entities/FeaturesTable";

/**
 * All feature fields with their validation rules, including the asset fields a feature shows as
 * its own (`name` is the title of the asset). Request and response DTOs derive from this schema.
 */
export const FeatureBaseSchema = z
  .strictObject({
    id: uuidDto,
    assetId: uuidDto,
    campaignId: uuidDto.nullable(),
    scope: AssetBaseSchema.shape.scope,
    name: z.string().trim().min(1).max(160),
    summary: AssetBaseSchema.shape.summary,
    status: AssetBaseSchema.shape.status,
    code: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    featureType: z.enum(FEATURE_TYPES),
    /** Markdown; only the rendered `descriptionHtml` of a response is HTML. */
    description: z.string().trim().min(1).max(FEATURE_DESCRIPTION_MAX_LENGTH).nullable(),
    stackingMode: z.enum(FEATURE_STACKING_MODES),
    sourceReference: AssetBaseSchema.shape.sourceReference,
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
    rulesetIds: AssetBaseSchema.shape.rulesetIds,
    assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
  })
  .extend(FeatureGraphSchema.shape);

export type FeatureBaseDto = z.infer<typeof FeatureBaseSchema>;
export type FeatureType = FeatureBaseDto["featureType"];
export type FeatureStackingMode = FeatureBaseDto["stackingMode"];
