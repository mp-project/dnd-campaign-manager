import { z } from "zod";

import { isoDateTimeDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import {
  CampaignMembershipRoleSchema,
  CampaignMembershipStatusSchema,
} from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";
import { UserTagSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const CampaignMemberResponseSchema = z.strictObject({
  id: uuidDto,
  userTag: UserTagSchema,
  displayName: z.string().min(1).max(120),
  role: CampaignMembershipRoleSchema,
  status: CampaignMembershipStatusSchema,
  joinedAt: isoDateTimeDto.nullable(),
  version: z.number().int().positive(),
});

export const CampaignMemberListItemResponseSchema = z.union([
  CampaignMemberResponseSchema,
  z.strictObject({
    id: uuidDto,
    userTag: UserTagSchema,
    displayName: z.string().min(1).max(120),
    role: CampaignMembershipRoleSchema,
  }),
]);

export const CampaignMembershipResponseSchema = z.strictObject({
  id: uuidDto,
  role: CampaignMembershipRoleSchema,
  status: CampaignMembershipStatusSchema,
  joinedAt: isoDateTimeDto.nullable(),
  version: z.number().int().positive(),
});

export const CampaignMemberListResponseSchema = standardListResponseDto(
  CampaignMemberListItemResponseSchema,
);