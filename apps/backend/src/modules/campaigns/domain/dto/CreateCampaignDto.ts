import { z } from "zod";

import { CampaignBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

export const CreateCampaignSchema = CampaignBaseSchema.pick({
  name: true,
  slug: true,
  description: true,
  rulesetId: true,
  settings: true,
  ownerUserId: true,
})
  .partial({ slug: true, description: true, settings: true, ownerUserId: true })
  .transform((value) => ({
    ...value,
    description: value.description ?? null,
    settings: value.settings ?? {},
  }));

export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;
