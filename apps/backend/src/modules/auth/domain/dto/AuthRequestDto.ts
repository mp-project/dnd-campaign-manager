import { z } from "zod";

import {
  EmailVerificationBaseSchema,
  UserBaseSchema,
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

export const OAuthProviderSchema = z.enum(["GOOGLE", "DISCORD"]);
export const OAuthIntentSchema = z.enum(["login", "register"]);

export const RegisterSchema = UserBaseSchema.pick({
  email: true,
  displayName: true,
  username: true,
})
  .partial({ username: true })
  .extend({ password: z.string().min(12).max(200) });

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

export const RequestEmailVerificationStatusParamsSchema = EmailVerificationBaseSchema.pick({
  verificationId: true,
});

export const VerifyEmailVerificationSchema = UserBaseSchema.pick({ email: true }).extend(
  EmailVerificationBaseSchema.pick({ verificationId: true, verificationCode: true }).shape,
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

export const OAuthCallbackQuerySchema = z.strictObject({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(512),
});

export const OAuthCompleteRegistrationSchema = UserBaseSchema.pick({
  displayName: true,
  username: true,
})
  .partial({ username: true })
  .extend({ privacyAccepted: z.literal(true) });

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export type VerifyEmailVerificationDto = z.infer<typeof VerifyEmailVerificationSchema>;
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
export type OAuthIntent = z.infer<typeof OAuthIntentSchema>;
