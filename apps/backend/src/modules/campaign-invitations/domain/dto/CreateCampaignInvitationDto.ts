import { z } from "zod";

import {
  UserEmailSchema,
  UserTagSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";
import { CampaignMembershipRoleSchema } from "#src/modules/campaign-memberships/domain/dto/BaseCampaignMembershipDto";

export const CreateCampaignInvitationSchema = z
  .strictObject({
    userTag: UserTagSchema.optional(),
    email: UserEmailSchema.optional(),
    role: CampaignMembershipRoleSchema,
    expiresInDays: z.coerce.number().int().min(1).max(30).default(7),
  })
  .refine((value) => Boolean(value.userTag) !== Boolean(value.email), {
    message: "Provide exactly one of userTag or email",
  });

export type CreateCampaignInvitationDto = z.infer<typeof CreateCampaignInvitationSchema>;