import { z } from "zod";

import { isoDateTimeDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import {
  CampaignMembershipRoleSchema,
} from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";
import { UserTagSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const CampaignInvitationResponseSchema = z.strictObject({
  id: uuidDto,
  email: z.string().email(),
  userTag: UserTagSchema.nullable(),
  role: CampaignMembershipRoleSchema,
  status: z.enum(["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]),
  expiresAt: isoDateTimeDto,
});

export const CampaignInvitationListResponseSchema = standardListResponseDto(
  CampaignInvitationResponseSchema,
);

export const MyCampaignInvitationResponseSchema = z.strictObject({
  invitationId: uuidDto,
  campaignId: uuidDto,
  role: CampaignMembershipRoleSchema,
  expiresAt: isoDateTimeDto,
});

export const MyCampaignInvitationListResponseSchema = z.strictObject({
  data: z.array(MyCampaignInvitationResponseSchema),
});

export const AcceptCampaignInvitationResponseSchema = z.strictObject({
  campaignId: uuidDto,
  membershipId: uuidDto,
  role: CampaignMembershipRoleSchema,
});

export const CampaignInvitationTargetResponseSchema = z.strictObject({
  userTag: z.string().min(1).max(32),
  displayName: z.string().min(1).max(120),
});