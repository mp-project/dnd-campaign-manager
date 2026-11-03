import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const UpdateUserSchema = UserBaseSchema.pick({
  displayName: true,
  systemRole: true,
  status: true,
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

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
