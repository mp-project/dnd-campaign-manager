import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { CampaignStatusSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

const RequestCampaignListFilterSchema = z.strictObject({
  includeArchived: z.coerce.boolean().default(false),
  status: CampaignStatusSchema.optional(),
  search: z.string().trim().min(1).max(160).optional(),
  userId: uuidDto.optional(),
});

export const RequestCampaignListQuerySchema =
  RequestCampaignListFilterSchema.merge(paginationDto);

export const RequestCampaignParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignTimeHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type RequestCampaignDto = {
  listQuery: z.infer<typeof RequestCampaignListQuerySchema>;
  params: z.infer<typeof RequestCampaignParamsSchema>;
  timeHistoryQuery: z.infer<typeof RequestCampaignTimeHistoryQuerySchema>;
};
