import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { ContentShareBaseSchema } from "#src/modules/content-shares/domain/dto/BaseContentShareDto";

/** Audience and recipients are checked together with the stored values in the service. */
export const UpdateContentShareSchema = ContentShareBaseSchema.pick({
  audience: true,
  recipientMemberIds: true,
  expiresAt: true,
})
  .partial()
  .extend(expectedVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, fieldValue]) => key !== "expectedVersion" && fieldValue !== undefined,
      ),
    { message: "At least one field must be provided for patch updates" },
  );

export type UpdateContentShareDto = z.infer<typeof UpdateContentShareSchema>;
