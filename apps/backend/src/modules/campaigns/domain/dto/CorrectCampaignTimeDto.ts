import { z } from "zod";

export const CorrectCampaignTimeSchema = z.strictObject({
  gameDay: z.coerce.number().int().min(0).max(10_000_000),
  longRestCount: z.coerce.number().int().min(0).max(10_000_000),
  reason: z.string().trim().min(1).max(4000),
});

export type CorrectCampaignTimeDto = z.infer<typeof CorrectCampaignTimeSchema>;
