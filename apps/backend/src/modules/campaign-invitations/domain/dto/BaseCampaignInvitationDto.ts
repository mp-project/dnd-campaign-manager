import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import { campaignInvitationStatusEnum } from "#src/modules/campaign-invitations/domain/entities/CampaignInvitationsTable";
import { CampaignMembershipBaseSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

/**
 * All campaign invitation fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const CampaignInvitationBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  email: UserBaseSchema.shape.email,
  userTag: UserBaseSchema.shape.userTag,
  role: CampaignMembershipBaseSchema.shape.role,
  status: z.enum(campaignInvitationStatusEnum.enumValues),
  expiresAt: isoDateTimeDto,
});

export type CampaignInvitationBaseDto = z.infer<typeof CampaignInvitationBaseSchema>;
export type CampaignInvitationRole = CampaignInvitationBaseDto["role"];
export type CampaignInvitationStatus = CampaignInvitationBaseDto["status"];
