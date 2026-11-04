import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { AssetLinkBaseSchema } from "#src/modules/asset-links/domain/dto/BaseAssetLinkDto";

export const ASSET_LINK_DIRECTIONS = ["outgoing", "incoming"] as const;

export const RequestAssetLinksParamsSchema = z.strictObject({
  campaignId: uuidDto,
  assetId: uuidDto,
});

export const RequestAssetLinkItemParamsSchema = RequestAssetLinksParamsSchema.extend({
  linkId: uuidDto,
});

export const RequestAssetLinksQuerySchema = z
  .strictObject({
    direction: z.enum(ASSET_LINK_DIRECTIONS).optional(),
    relationType: AssetLinkBaseSchema.shape.relationType.optional(),
  })
  .merge(paginationDto);

export type AssetLinkDirection = (typeof ASSET_LINK_DIRECTIONS)[number];
export type RequestAssetLinksQueryDto = z.infer<typeof RequestAssetLinksQuerySchema>;
