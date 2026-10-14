import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { UserTagSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const CampaignInvitationParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const CampaignInvitationItemParamsSchema = CampaignInvitationParamsSchema.extend({
  invitationId: uuidDto,
});

export const AcceptCampaignInvitationSchema = z.strictObject({
  token: z.string().min(40).max(128),
});

export const CampaignInvitationLookupQuerySchema = z.strictObject({
  userTag: UserTagSchema,
});