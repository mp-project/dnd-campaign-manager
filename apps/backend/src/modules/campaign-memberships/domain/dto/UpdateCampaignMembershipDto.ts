import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { CampaignMembershipBaseSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";

export const UpdateCampaignMembershipRoleSchema = CampaignMembershipBaseSchema.pick({
  role: true,
}).extend(expectedVersionDto.shape);

export type UpdateCampaignMembershipRoleDto = z.infer<
  typeof UpdateCampaignMembershipRoleSchema
>;
