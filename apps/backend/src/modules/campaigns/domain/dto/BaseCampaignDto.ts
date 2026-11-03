import { z } from "zod";

import { baseEntityResponseDto, uuidDto } from "#core/http/dto";
import {
  campaignStatusEnum,
  campaignTimeEventTypeEnum,
} from "#src/modules/campaigns/domain/entities/CampaignsTable";

/**
 * All campaign fields with their validation rules.
 * Request and response DTOs derive their fields from this schema.
 */
export const CampaignBaseSchema = baseEntityResponseDto.extend({
  ownerUserId: uuidDto,
  rulesetId: uuidDto,
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(4000).nullable(),
  status: z.enum(campaignStatusEnum.enumValues),
  currentGameDay: z.number().int().nonnegative(),
  longRestCount: z.number().int().nonnegative(),
  settings: z.record(z.string(), z.unknown()),
});

/**
 * All campaign time event fields with their validation rules.
 */
export const CampaignTimeEventBaseSchema = baseEntityResponseDto.extend({
  campaignId: uuidDto,
  type: z.enum(campaignTimeEventTypeEnum.enumValues),
  previousGameDay: z.number().int().nonnegative(),
  newGameDay: z.number().int().nonnegative(),
  previousLongRestCount: z.number().int().nonnegative(),
  newLongRestCount: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(4000).nullable(),
});

export type CampaignBaseDto = z.infer<typeof CampaignBaseSchema>;
export type CampaignStatus = CampaignBaseDto["status"];
export type CampaignTimeEventBaseDto = z.infer<typeof CampaignTimeEventBaseSchema>;
export type CampaignTimeEventType = CampaignTimeEventBaseDto["type"];
