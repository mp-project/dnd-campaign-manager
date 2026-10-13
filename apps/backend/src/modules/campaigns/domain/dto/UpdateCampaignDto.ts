import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import {
  CampaignDescriptionSchema,
  CampaignNameSchema,
  CampaignSettingsSchema,
  CampaignSlugSchema,
  CampaignStatusSchema,
} from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

const UpdateCampaignMutableFieldsSchema = z
  .strictObject({
    name: CampaignNameSchema,
    slug: CampaignSlugSchema,
    description: CampaignDescriptionSchema,
    status: CampaignStatusSchema,
    settings: CampaignSettingsSchema,
  })
  .partial();

export const UpdateCampaignSchema = UpdateCampaignMutableFieldsSchema
  .and(expectedVersionDto)
  .refine(
    (value) =>
      value.name !== undefined ||
      value.slug !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.settings !== undefined,
    {
      message: "At least one field must be provided for patch updates",
    },
  );

export type UpdateCampaignDto = z.infer<typeof UpdateCampaignSchema>;
