import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { CampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";

export const CreateCampaignMembershipSchema = z.strictObject({
  userId: uuidDto,
  role: CampaignMembershipRoleSchema,
});

export type CreateCampaignMembershipDto = z.infer<typeof CreateCampaignMembershipSchema>;