import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import {
  CampaignDescriptionSchema,
  CampaignNameSchema,
  CampaignSettingsSchema,
  CampaignSlugSchema,
} from "#src/modules/campaigns/domain/dto/BaseCampaignDto";

const CreateCampaignObjectSchema = z.strictObject({
  name: CampaignNameSchema,
  slug: CampaignSlugSchema.optional(),
  description: CampaignDescriptionSchema.optional(),
  rulesetId: uuidDto,
  settings: CampaignSettingsSchema.optional(),
  ownerUserId: uuidDto.optional(),
  createdBy: uuidDto,
});

export const CreateCampaignRequestSchema = CreateCampaignObjectSchema.omit({
  createdBy: true,
}).transform((value) => ({
  ...value,
  description: value.description ?? null,
  settings: value.settings ?? {},
}));

export const CreateCampaignSchema = CreateCampaignObjectSchema.transform((value) => ({
  ...value,
  description: value.description ?? null,
  settings: value.settings ?? {},
}));

export type CreateCampaignDto = z.infer<typeof CreateCampaignSchema>;
