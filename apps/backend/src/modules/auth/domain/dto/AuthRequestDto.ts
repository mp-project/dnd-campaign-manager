import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import {
  UserDisplayNameSchema,
  UserEmailSchema,
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

export const RegisterSchema = z.strictObject({
  email: UserEmailSchema,
  displayName: UserDisplayNameSchema,
  password: z.string().min(12).max(200),
});

export const LoginSchema = z.strictObject({
  email: UserEmailSchema,
  password: z.string().min(1).max(200),
});

export const RefreshSchema = z.strictObject({
  refreshToken: z.string().min(1).max(1024).optional(),
});

export const LogoutSchema = z.strictObject({
  refreshToken: z.string().min(1).max(1024).optional(),
});

export const RequestEmailVerificationSchema = z.strictObject({
  email: UserEmailSchema,
});

export const RequestEmailVerificationStatusParamsSchema = z.strictObject({
  verificationId: uuidDto,
});

export const VerifyEmailVerificationSchema = z.strictObject({
  email: UserEmailSchema,
  verificationId: uuidDto,
  verificationCode: z.string().regex(/^\d{6}$/),
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

export const OAuthCompleteRegistrationSchema = z.strictObject({
  displayName: UserDisplayNameSchema,
  privacyAccepted: z.literal(true),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export type VerifyEmailVerificationDto = z.infer<typeof VerifyEmailVerificationSchema>;
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
export type OAuthIntent = z.infer<typeof OAuthIntentSchema>;
