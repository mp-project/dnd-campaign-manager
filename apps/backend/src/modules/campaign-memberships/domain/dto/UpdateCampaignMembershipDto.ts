import { z } from "zod";

import { CampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";

export const UpdateCampaignMembershipRoleSchema = z.strictObject({
  role: CampaignMembershipRoleSchema,
  expectedVersion: z.coerce.number().int().positive(),
});

export type UpdateCampaignMembershipRoleDto = z.infer<
  typeof UpdateCampaignMembershipRoleSchema
>;