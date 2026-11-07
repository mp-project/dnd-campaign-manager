import { z } from "zod";

import { nonEmptyPatch } from "#core/http/dto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

/**
 * The email address is not part of the profile patch: it changes through
 * `POST /me/email-change`, which needs the password and a confirmation from the new address.
 */
export const UpdateMeSchema = nonEmptyPatch(
  UserBaseSchema.pick({ displayName: true }).shape,
);

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
