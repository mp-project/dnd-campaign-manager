import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/domain/dto/BaseAssetDto";

const AssetSearchSchema = z.string().trim().min(1).max(200);

export const RequestCampaignAssetsParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestAssetParamsSchema = z.strictObject({
  assetId: uuidDto,
});

export const RequestCatalogParamsSchema = AssetBaseSchema.pick({ assetType: true });

export const RequestCampaignCatalogParamsSchema = RequestCatalogParamsSchema.extend(
  RequestCampaignAssetsParamsSchema.shape,
);

export const RequestCampaignAssetsQuerySchema = AssetBaseSchema.pick({
  assetType: true,
  status: true,
})
  .partial()
  .extend({ search: AssetSearchSchema.optional() })
  .merge(paginationDto);

export const RequestCampaignCatalogQuerySchema = z
  .strictObject({
    search: AssetSearchSchema.optional(),
  })
  .merge(paginationDto);

export const RequestCatalogQuerySchema = z
  .strictObject({
    ruleset: uuidDto.optional(),
    search: AssetSearchSchema.optional(),
  })
  .merge(paginationDto);

export type RequestAssetDto = {
  campaignAssetsQuery: z.infer<typeof RequestCampaignAssetsQuerySchema>;
  campaignCatalogQuery: z.infer<typeof RequestCampaignCatalogQuerySchema>;
  catalogQuery: z.infer<typeof RequestCatalogQuerySchema>;
};
