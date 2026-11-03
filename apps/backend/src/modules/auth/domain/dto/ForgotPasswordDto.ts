import { z } from "zod";

import {
  UserBaseSchema,
  UserSettingsBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const ForgotPasswordSchema = UserBaseSchema.pick({ email: true }).extend({
  locale: UserSettingsBaseSchema.shape.locale.optional(),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
