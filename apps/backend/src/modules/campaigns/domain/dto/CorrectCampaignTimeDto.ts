import { z } from "zod";

import { CampaignTimeEventBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

export const CorrectCampaignTimeSchema = z.strictObject({
  gameDay: z.coerce.number().int().min(0).max(10_000_000),
  longRestCount: z.coerce.number().int().min(0).max(10_000_000),
  reason: CampaignTimeEventBaseSchema.shape.reason.unwrap(),
});

export type CorrectCampaignTimeDto = z.infer<typeof CorrectCampaignTimeSchema>;
