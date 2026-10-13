import { z } from "zod";

export const AdvanceCampaignTimeSchema = z
  .strictObject({
    days: z.coerce.number().int().min(0).max(10000).default(0),
    longRests: z.coerce.number().int().min(0).max(10000).default(0),
    reason: z.string().trim().min(1).max(4000).nullable().optional(),
  })
  .refine((value) => value.days > 0 || value.longRests > 0, {
    message: "At least one positive time change is required",
  })
  .transform((value) => ({
    ...value,
    reason: value.reason ?? null,
  }));

export type AdvanceCampaignTimeDto = z.infer<typeof AdvanceCampaignTimeSchema>;
