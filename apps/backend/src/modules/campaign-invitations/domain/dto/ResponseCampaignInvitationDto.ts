import { z } from "zod";

import { standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import { CampaignInvitationBaseSchema } from "#src/modules/campaign-invitations/domain/dto/BaseCampaignInvitationDto";
import type { CampaignInvitationRow } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { UserDisplayNameSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const CampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
}).extend({ userTag: CampaignInvitationBaseSchema.shape.userTag.nullable() });

export const CampaignInvitationListResponseSchema = standardListResponseDto(
  CampaignInvitationResponseSchema,
);

export const MyCampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  campaignId: true,
  role: true,
  expiresAt: true,
}).extend({ invitationId: CampaignInvitationBaseSchema.shape.id });

export const MyCampaignInvitationListResponseSchema = z.strictObject({
  data: z.array(MyCampaignInvitationResponseSchema),
});

export const AcceptCampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  campaignId: true,
  role: true,
}).extend({ membershipId: CampaignInvitationBaseSchema.shape.id });

export const CampaignInvitationTargetResponseSchema = CampaignInvitationBaseSchema.pick({
  userTag: true,
}).extend({ displayName: UserDisplayNameSchema });

export type CampaignInvitationResponseDto = z.infer<typeof CampaignInvitationResponseSchema>;
export type CampaignInvitationListResponseDto = z.infer<typeof CampaignInvitationListResponseSchema>;
export type MyCampaignInvitationListResponseDto = z.infer<
  typeof MyCampaignInvitationListResponseSchema
>;
export type AcceptCampaignInvitationResponseDto = z.infer<
  typeof AcceptCampaignInvitationResponseSchema
>;
export type CampaignInvitationTargetResponseDto = z.infer<
  typeof CampaignInvitationTargetResponseSchema
>;

export function toCampaignInvitationResponse(
  invitation: CampaignInvitationRow,
  userTag: string | null,
): CampaignInvitationResponseDto {
  return {
    id: invitation.id,
    email: invitation.email,
    userTag,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
  };
}

export function toCampaignInvitationListResponse(
  invitations: CampaignInvitationRow[],
  userTagById: ReadonlyMap<string, string>,
): CampaignInvitationListResponseDto {
  const data = invitations.map((invitation) =>
    toCampaignInvitationResponse(
      invitation,
      invitation.targetUserId ? (userTagById.get(invitation.targetUserId) ?? null) : null,
    ),
  );

  return createStandardListResponse({
    data,
    limit: Math.max(data.length, 1),
    nextCursor: null,
    total: data.length,
  });
}

export function toMyCampaignInvitationListResponse(
  invitations: CampaignInvitationRow[],
): MyCampaignInvitationListResponseDto {
  return {
    data: invitations.map((invitation) => ({
      invitationId: invitation.id,
      campaignId: invitation.campaignId,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    })),
  };
}
