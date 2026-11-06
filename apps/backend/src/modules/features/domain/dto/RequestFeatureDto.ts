import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { campaignFactValues } from "#core/rules/campaignFacts";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { FeatureBaseSchema } from "#src/modules/features/domain/dto/BaseFeatureDto";
import { featureKeyDto, MAX_LEVEL } from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import { ABILITIES } from "#src/modules/features/domain/FeatureDefinition";

export const RequestCampaignFeaturesParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignFeatureParamsSchema = RequestCampaignFeaturesParamsSchema.extend({
  featureId: uuidDto,
});

export const RequestSystemFeatureParamsSchema = z.strictObject({
  featureId: uuidDto,
});

/** Params of routes shared by custom and global features; without a campaign it is global. */
export const RequestFeatureScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestFeatureParamsSchema = RequestFeatureScopeParamsSchema.extend({
  featureId: uuidDto,
});

const listFilterShape = FeatureBaseSchema.pick({ featureType: true, status: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active features they may see. */
export const RequestCampaignFeaturesQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** The catalog shows global features for the campaign ruleset and the campaign's own ones. */
export const RequestFeatureCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemFeaturesQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

const level = z.number().int().min(1).max(MAX_LEVEL);

export const ActorSnapshotSchema = z.strictObject({
  characterLevel: level.optional(),
  classLevel: level.optional(),
  sourceLevel: level.optional(),
  proficiencyBonus: z.number().int().min(0).max(20).optional(),
  abilities: z
    .partialRecord(z.enum(ABILITIES), z.number().int().min(1).max(30))
    .optional(),
  proficiencies: z.array(z.string().min(1).max(100)).max(200).optional(),
  ownedAssetIds: z.array(uuidDto).max(500).optional(),
  tags: z.array(z.string().min(1).max(100)).max(200).optional(),
  facts: z.record(z.string().min(1).max(100), z.enum(campaignFactValues)).optional(),
});

export const FeatureBindingsSchema = z.strictObject({
  parameters: z.record(featureKeyDto, z.json()).optional(),
  choices: z
    .record(featureKeyDto, z.array(z.string().min(1).max(100)).max(50))
    .optional(),
});

export const ResolveFeatureSchema = z.strictObject({
  bindings: FeatureBindingsSchema.default({}),
  actor: ActorSnapshotSchema.default({}),
});

export type RequestCampaignFeaturesQueryDto = z.infer<typeof RequestCampaignFeaturesQuerySchema>;
export type RequestFeatureCatalogQueryDto = z.infer<typeof RequestFeatureCatalogQuerySchema>;
export type RequestSystemFeaturesQueryDto = z.infer<typeof RequestSystemFeaturesQuerySchema>;
export type ResolveFeatureDto = z.infer<typeof ResolveFeatureSchema>;
