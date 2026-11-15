import { z } from "zod";

import { oauthProviderEnum } from "#src/modules/auth/domain/entities/AuthTable";
import {
  EmailVerificationBaseSchema,
  UserBaseSchema,
  UserSettingsBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export {
  ChangePasswordSchema,
} from "#src/modules/auth/domain/dto/ChangePasswordDto";
export type {
  ChangePasswordDto,
} from "#src/modules/auth/domain/dto/ChangePasswordDto";
export {
  ForgotPasswordSchema,
} from "#src/modules/auth/domain/dto/ForgotPasswordDto";
export type {
  ForgotPasswordDto,
} from "#src/modules/auth/domain/dto/ForgotPasswordDto";
export {
  ResetPasswordSchema,
} from "#src/modules/auth/domain/dto/ResetPasswordDto";
export type {
  ResetPasswordDto,
} from "#src/modules/auth/domain/dto/ResetPasswordDto";

export const OAuthProviderSchema = z.enum(oauthProviderEnum.enumValues);
export const OAuthIntentSchema = z.enum(["login", "register"]);

/**
 * Language and time zone of the browser that registers, stored as the account's first settings.
 * A value the server doesn't accept (an unknown zone) is dropped instead of refusing the
 * registration; the defaults apply then.
 */
const RegistrationSettingsShape = {
  locale: UserSettingsBaseSchema.shape.locale.optional().catch(undefined),
  timezone: UserSettingsBaseSchema.shape.timezone.optional().catch(undefined),
};

export const RegisterSchema = UserBaseSchema.pick({
  email: true,
  displayName: true,
  username: true,
})
  .partial({ username: true })
  .extend({
    password: z.string().min(12).max(200),
    privacyAccepted: z.literal(true),
    ...RegistrationSettingsShape,
  });

export const LoginSchema = UserBaseSchema.pick({ email: true }).extend({
  password: z.string().min(1).max(200),
  trustDevice: z.boolean().optional(),
});

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(1).max(1024).optional(),
});

export const LogoutSchema = z.strictObject({
  refreshToken: z.string().min(1).max(1024).optional(),
});

export const RequestEmailVerificationSchema = UserBaseSchema.pick({ email: true });

export const VerifyEmailVerificationSchema = UserBaseSchema.pick({ email: true }).extend(
  EmailVerificationBaseSchema.pick({ verificationCode: true }).shape,
);

export const VerifyEmailVerificationLinkQuerySchema = z.strictObject({
  token: z.string().min(1).max(4096),
});

export const OAuthStartParamsSchema = z.strictObject({
  provider: OAuthProviderSchema,
});

export const OAuthStartQuerySchema = z
  .strictObject({
    intent: OAuthIntentSchema.default("login"),
    redirect: z.string().min(1).max(500).optional(),
  })
  .transform((value) => ({
    ...value,
    redirect: value.redirect ?? "/",
  }));

export const OAuthCallbackParamsSchema = z.strictObject({
  provider: OAuthProviderSchema,
});

/**
 * Not strict: providers add their own parameters (Google: `scope`, `authuser`, `prompt`, `hd`).
 * `code` and `state` are missing when the user cancels at the provider (`error=access_denied`);
 * the controller then sends the browser back to the frontend with an error.
 */
export const OAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).max(4096).optional(),
  state: z.string().min(1).max(512).optional(),
  error: z.string().max(256).optional(),
});

export const OAuthCompleteRegistrationSchema = UserBaseSchema.pick({
  displayName: true,
  username: true,
})
  .partial({ username: true })
  .extend({ privacyAccepted: z.literal(true), ...RegistrationSettingsShape });

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export type VerifyEmailVerificationDto = z.infer<typeof VerifyEmailVerificationSchema>;
export type OAuthCompleteRegistrationDto = z.infer<typeof OAuthCompleteRegistrationSchema>;
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
export type OAuthIntent = z.infer<typeof OAuthIntentSchema>;
