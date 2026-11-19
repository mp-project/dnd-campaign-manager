import { z } from "zod";

import { standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import { CampaignInvitationBaseSchema } from "#src/modules/campaign-invitations/domain/dto/BaseCampaignInvitationDto";
import type { CampaignInvitationRow } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const CampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
}).extend({
  /** The address an invitation by email went to; null for one by user tag (the account's address stays private). */
  email: CampaignInvitationBaseSchema.shape.email.nullable(),
  /** The account an invitation by user tag names; null for one by email address. */
  userTag: CampaignInvitationBaseSchema.shape.userTag.nullable(),
});

export const CampaignInvitationListResponseSchema = standardListResponseDto(
  CampaignInvitationResponseSchema,
);

/**
 * An invitation of the account's own list, with what the invited person needs to decide: the
 * campaign's name and who invited them (null once that account is gone).
 */
export const MyCampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  campaignId: true,
  role: true,
  expiresAt: true,
  createdAt: true,
}).extend({
  invitationId: CampaignInvitationBaseSchema.shape.id,
  campaignName: z.string().min(1),
  invitedByName: z.string().min(1).nullable(),
});

export const MyCampaignInvitationListResponseSchema = z.strictObject({
  data: z.array(MyCampaignInvitationResponseSchema),
});

export const AcceptCampaignInvitationResponseSchema = CampaignInvitationBaseSchema.pick({
  campaignId: true,
  role: true,
}).extend({ membershipId: CampaignInvitationBaseSchema.shape.id });

export const CampaignInvitationTargetResponseSchema = CampaignInvitationBaseSchema.pick({
  userTag: true,
}).extend({ displayName: UserBaseSchema.shape.displayName });

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
    email: invitation.targetUserId ? null : invitation.email,
    userTag,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
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
  invitations: Array<{ invitation: CampaignInvitationRow; campaignName: string; invitedByName: string | null }>,
): MyCampaignInvitationListResponseDto {
  return {
    data: invitations.map(({ invitation, campaignName, invitedByName }) => ({
      invitationId: invitation.id,
      campaignId: invitation.campaignId,
      campaignName,
      invitedByName,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    })),
  };
}
