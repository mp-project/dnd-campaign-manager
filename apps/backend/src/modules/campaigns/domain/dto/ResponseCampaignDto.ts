import { z } from "zod";

import {
  baseEntityResponseDto,
  standardListResponseDto,
  uuidDto,
} from "#core/http/dto";
import {
  CampaignSettingsSchema,
  CampaignStatusSchema,
  CampaignTimeEventTypeSchema,
} from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

export const ResponseCampaignSchema = baseEntityResponseDto.extend({
  ownerUserId: uuidDto,
  rulesetId: uuidDto,
  name: z.string().min(1).max(160),
  slug: z.string().min(1).max(180),
  description: z.string().nullable(),
  status: CampaignStatusSchema,
  currentGameDay: z.number().int().nonnegative(),
  longRestCount: z.number().int().nonnegative(),
  settings: CampaignSettingsSchema,
  isOwner: z.boolean(),
  effectivePermissions: z.array(z.string().min(1)),
});

export const ResponseCampaignListSchema = standardListResponseDto(ResponseCampaignSchema);

export const ResponseCampaignTimeEventSchema = baseEntityResponseDto.extend({
  campaignId: uuidDto,
  type: CampaignTimeEventTypeSchema,
  previousGameDay: z.number().int().nonnegative(),
  newGameDay: z.number().int().nonnegative(),
  previousLongRestCount: z.number().int().nonnegative(),
  newLongRestCount: z.number().int().nonnegative(),
  reason: z.string().nullable(),
});

export const ResponseCampaignTimeHistorySchema = standardListResponseDto(
  ResponseCampaignTimeEventSchema,
);

export type ResponseCampaignDto = z.infer<typeof ResponseCampaignSchema>;
