import { z } from "zod";

import { nonEmptyPatch } from "#core/http/dto";
import {
  UserDisplayNameSchema,
  UserEmailSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const UpdateMeSchema = nonEmptyPatch({
  displayName: UserDisplayNameSchema,
  email: UserEmailSchema,
});

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
