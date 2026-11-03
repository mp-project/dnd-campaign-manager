import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import {
  campaignMemberRoleEnum,
  campaignMembershipStatusEnum,
} from "#src/modules/campaigns/domain/entities/CampaignsTable";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

/**
 * All campaign membership fields with their validation rules.
 * Request and response DTOs derive their fields from this schema via `pick`.
 */
export const CampaignMembershipBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  userTag: UserBaseSchema.shape.userTag,
  displayName: z.string().min(1).max(120),
  role: z.enum(campaignMemberRoleEnum.enumValues),
  status: z.enum(campaignMembershipStatusEnum.enumValues),
  joinedAt: isoDateTimeDto.nullable(),
  version: z.number().int().positive(),
});

export type CampaignMembershipBaseDto = z.infer<typeof CampaignMembershipBaseSchema>;
export type CampaignMembershipRole = CampaignMembershipBaseDto["role"];
export type CampaignMembershipStatus = CampaignMembershipBaseDto["status"];
