import { z } from "zod";

import {
  audienceMatchesRecipients,
  ContentShareBaseSchema,
} from "#src/modules/content-shares/domain/dto/BaseContentShareDto";

export const CreateContentShareSchema = ContentShareBaseSchema.pick({
  assetId: true,
  audience: true,
})
  .extend({
    recipientMemberIds: ContentShareBaseSchema.shape.recipientMemberIds.optional(),
    expiresAt: ContentShareBaseSchema.shape.expiresAt.optional(),
  })
  .refine(audienceMatchesRecipients, {
    message: "All players take no recipients, selected players at least one",
    path: ["recipientMemberIds"],
  });

export type CreateContentShareDto = z.infer<typeof CreateContentShareSchema>;
