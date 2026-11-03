import { z } from "zod";

import { CampaignTimeEventBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

export const AdvanceCampaignTimeSchema = CampaignTimeEventBaseSchema.pick({ reason: true })
  .partial()
  .extend({
    days: z.coerce.number().int().min(0).max(10000).default(0),
    longRests: z.coerce.number().int().min(0).max(10000).default(0),
  })
  .refine((value) => value.days > 0 || value.longRests > 0, {
    message: "At least one positive time change is required",
  })
  .transform((value) => ({
    ...value,
    reason: value.reason ?? null,
  }));

export type AdvanceCampaignTimeDto = z.infer<typeof AdvanceCampaignTimeSchema>;
