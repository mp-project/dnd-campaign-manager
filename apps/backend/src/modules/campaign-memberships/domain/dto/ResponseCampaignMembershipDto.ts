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
});

/**
 * Reduced member view for players.
 */
export const CampaignMemberLimitedResponseSchema = CampaignMembershipBaseSchema.pick({
  id: true,
  userTag: true,
  displayName: true,
  role: true,
});

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

export type CampaignMemberListResponseDto = z.infer<typeof CampaignMemberListResponseSchema>;
export type CampaignMembershipResponseDto = z.infer<typeof CampaignMembershipResponseSchema>;

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

export function toCampaignMemberListResponse(
  members: CampaignMember[],
  canManage: boolean,
): CampaignMemberListResponseDto {
  const data = members.map(({ membership, userTag, displayName }) =>
    canManage
      ? { ...toCampaignMembershipResponse(membership), userTag, displayName }
      : { id: membership.id, userTag, displayName, role: membership.role },
  );

  return createStandardListResponse({
    data,
    limit: Math.max(data.length, 1),
    nextCursor: null,
    total: data.length,
  });
}
