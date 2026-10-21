import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import {
  ASSET_ORIGINS,
  ASSET_RULESET_POLICIES,
  ASSET_SCOPES,
  ASSET_STATUSES,
  ASSET_TYPES,
} from "#src/modules/assets/domain/entities/AssetsTable";

/**
 * All asset metadata fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const AssetBaseSchema = z.strictObject({
  id: uuidDto,
  assetType: z.enum(ASSET_TYPES),
  title: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(220)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().min(1).max(500).nullable(),
  status: z.enum(ASSET_STATUSES),
  scope: z.enum(ASSET_SCOPES),
  origin: z.enum(ASSET_ORIGINS),
  campaignId: uuidDto.nullable(),
  assetFamilyId: uuidDto.nullable(),
  rulesetPolicy: z.enum(ASSET_RULESET_POLICIES),
  rulesetIds: z.array(uuidDto).max(20),
  sourceReference: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * Statuses that may be set directly; archiving goes through the lifecycle commands.
 */
export const AssetEditableStatusSchema = AssetBaseSchema.shape.status.extract([
  "DRAFT",
  "ACTIVE",
]);

export type AssetBaseDto = z.infer<typeof AssetBaseSchema>;
export type AssetType = AssetBaseDto["assetType"];
export type AssetStatus = AssetBaseDto["status"];
export type AssetRulesetPolicy = AssetBaseDto["rulesetPolicy"];
