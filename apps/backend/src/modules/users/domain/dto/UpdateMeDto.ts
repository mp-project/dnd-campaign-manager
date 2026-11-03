import { z } from "zod";

import { nonEmptyPatch } from "#core/http/dto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const UpdateMeSchema = nonEmptyPatch(
  UserBaseSchema.pick({ displayName: true, email: true }).shape,
);

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
