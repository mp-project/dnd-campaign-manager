import { z } from "zod";

import {
  UserEmailSchema,
  UserLocaleSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const ForgotPasswordSchema = z.strictObject({
  email: UserEmailSchema,
  locale: UserLocaleSchema.optional(),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
