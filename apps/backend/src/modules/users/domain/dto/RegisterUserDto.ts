import { z } from "zod";

import {
  UserDisplayNameSchema,
  UserEmailSchema,
  UserUsernameSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const RegisterUserSchema = z.strictObject({
  email: UserEmailSchema,
  displayName: UserDisplayNameSchema,
  username: UserUsernameSchema.optional(),
  password: z.string().min(12).max(200),
});

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
