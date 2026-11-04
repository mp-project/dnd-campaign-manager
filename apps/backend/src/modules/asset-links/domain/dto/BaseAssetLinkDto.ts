import { z } from "zod";

import { uuidDto } from "#core/http/dto";

/**
 * All asset link fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const AssetLinkBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  sourceAssetId: uuidDto,
  targetAssetId: uuidDto,
  relationType: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  label: z.string().trim().min(1).max(160).nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000),
  metadata: z.record(z.string(), z.unknown()),
});

export type AssetLinkBaseDto = z.infer<typeof AssetLinkBaseSchema>;
