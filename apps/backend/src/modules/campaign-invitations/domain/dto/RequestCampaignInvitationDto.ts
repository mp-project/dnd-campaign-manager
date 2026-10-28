import { z } from "zod";

import { CampaignInvitationBaseSchema } from "#src/modules/campaign-invitations/domain/dto/BaseCampaignInvitationDto";

export const CampaignInvitationParamsSchema = CampaignInvitationBaseSchema.pick({
  campaignId: true,
});

export const CampaignInvitationItemParamsSchema = CampaignInvitationParamsSchema.extend({
  invitationId: CampaignInvitationBaseSchema.shape.id,
});

export const AcceptCampaignInvitationSchema = z.strictObject({
  token: z.string().min(40).max(128),
});

export const CampaignInvitationLookupQuerySchema = CampaignInvitationBaseSchema.pick({
  userTag: true,
});
