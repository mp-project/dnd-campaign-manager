import { CampaignMembershipBaseSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";

export const CampaignMembershipParamsSchema = CampaignMembershipBaseSchema.pick({
  campaignId: true,
});

export const CampaignMembershipItemParamsSchema = CampaignMembershipParamsSchema.extend({
  memberId: CampaignMembershipBaseSchema.shape.id,
});
