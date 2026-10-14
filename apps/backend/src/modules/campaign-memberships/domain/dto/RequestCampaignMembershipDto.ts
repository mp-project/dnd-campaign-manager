import { z } from "zod";

import { uuidDto } from "#core/http/dto";

export const CampaignMembershipParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const CampaignMembershipItemParamsSchema = CampaignMembershipParamsSchema.extend({
  memberId: uuidDto,
});

export type RequestCampaignMembershipDto = {
  params: z.infer<typeof CampaignMembershipParamsSchema>;
  itemParams: z.infer<typeof CampaignMembershipItemParamsSchema>;
};