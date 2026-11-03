import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { CampaignBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

export const UpdateCampaignSchema = CampaignBaseSchema.pick({
  name: true,
  slug: true,
  description: true,
  status: true,
  settings: true,
})
  .partial()
  .extend(expectedVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([field, fieldValue]) => field !== "expectedVersion" && fieldValue !== undefined,
      ),
    { message: "At least one field must be provided for patch updates" },
  );

export type UpdateCampaignDto = z.infer<typeof UpdateCampaignSchema>;
