import { z } from "zod";

import { standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import { CampaignMembershipBaseSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";
import type { CampaignMembershipRow } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";

/**
 * Full member view for campaign managers (owner, editors, system admins).
 */
export const CampaignMemberResponseSchema = CampaignMembershipBaseSchema.pick({
  id: true,
  userTag: true,
  displayName: true,
  role: true,
  status: true,
  joinedAt: true,
  version: true,
}).extend({
  /** The campaign's owner (game master); their membership is an editor's and can't be changed. */
  isOwner: z.boolean(),
});

/**
 * Reduced member view for players.
 */
export const CampaignMemberLimitedResponseSchema = CampaignMembershipBaseSchema.pick({
  id: true,
  userTag: true,
  displayName: true,
  role: true,
}).extend({ isOwner: z.boolean() });

export const CampaignMemberListItemResponseSchema = z.union([
  CampaignMemberResponseSchema,
  CampaignMemberLimitedResponseSchema,
]);

export const CampaignMemberListResponseSchema = standardListResponseDto(
  CampaignMemberListItemResponseSchema,
);

export const CampaignMembershipResponseSchema = CampaignMembershipBaseSchema.pick({
  id: true,
  role: true,
  status: true,
  joinedAt: true,
  version: true,
});

export const UpdateCampaignMembershipResponseSchema = CampaignMembershipResponseSchema.extend({
  merged: z.array(z.string().min(1)),
});

export type CampaignMemberListResponseDto = z.infer<typeof CampaignMemberListResponseSchema>;
export type CampaignMembershipResponseDto = z.infer<typeof CampaignMembershipResponseSchema>;

export type UpdateCampaignMembershipResponseDto = z.infer<
  typeof UpdateCampaignMembershipResponseSchema
>;

export type CampaignMember = {
  membership: CampaignMembershipRow;
  userTag: string;
  displayName: string;
};

export function toCampaignMembershipResponse(
  membership: CampaignMembershipRow,
): CampaignMembershipResponseDto {
  return {
    id: membership.id,
    role: membership.role,
    status: membership.status,
    joinedAt: membership.joinedAt?.toISOString() ?? null,
    version: membership.version,
  };
}

export function toUpdateCampaignMembershipResponse(
  membership: CampaignMembershipRow,
  merged: string[],
): UpdateCampaignMembershipResponseDto {
  return { ...toCampaignMembershipResponse(membership), merged };
}

export function toCampaignMemberListResponse(
  members: CampaignMember[],
  canManage: boolean,
  ownerUserId: string,
): CampaignMemberListResponseDto {
  const data = members.map(({ membership, userTag, displayName }) => {
    const isOwner = membership.userId === ownerUserId;
    return canManage
      ? { ...toCampaignMembershipResponse(membership), userTag, displayName, isOwner }
      : { id: membership.id, userTag, displayName, role: membership.role, isOwner };
  });

  return createStandardListResponse({
    data,
    limit: Math.max(data.length, 1),
    nextCursor: null,
    total: data.length,
  });
}
