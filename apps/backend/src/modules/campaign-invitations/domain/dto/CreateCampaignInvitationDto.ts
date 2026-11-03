import { z } from "zod";

import { CampaignInvitationBaseSchema } from "#src/modules/campaign-invitations/domain/dto/BaseCampaignInvitationDto";

export const CreateCampaignInvitationSchema = CampaignInvitationBaseSchema.pick({
  userTag: true,
  email: true,
  role: true,
})
  .partial({ userTag: true, email: true })
  .extend({ expiresInDays: z.coerce.number().int().min(1).max(30).default(7) })
  .refine((value) => Boolean(value.userTag) !== Boolean(value.email), {
    message: "Provide exactly one of userTag or email",
  });

export type CreateCampaignInvitationDto = z.infer<typeof CreateCampaignInvitationSchema>;
