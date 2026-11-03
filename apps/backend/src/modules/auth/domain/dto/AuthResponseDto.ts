import { z } from "zod";

import { isoDateTimeDto } from "#core/http/dto";
import {
  EmailVerificationBaseSchema,
  UserBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";
import type {
  EmailVerificationRequestRow,
  UserRow,
} from "#src/modules/auth/domain/repository/AuthRepository";
import type { AuthSession } from "#src/modules/auth/service/AuthService.contracts";

export const AuthUserProfileSchema = UserBaseSchema.pick({
  id: true,
  email: true,
  displayName: true,
  username: true,
  userTag: true,
  systemRole: true,
  status: true,
  emailVerifiedAt: true,
});

export const AuthResponseSchema = z.strictObject({
  user: AuthUserProfileSchema,
  accessToken: z.string().min(1),
  accessExpiresAt: isoDateTimeDto,
});

export const ResponseEmailVerificationSchema = EmailVerificationBaseSchema.pick({
  verificationId: true,
  status: true,
  expiresAt: true,
  verifiedAt: true,
});

export const ResponseRegisterUserSchema = AuthUserProfileSchema.extend({
  verificationId: EmailVerificationBaseSchema.shape.verificationId,
  verificationCode: EmailVerificationBaseSchema.shape.verificationCode.nullable(),
  emailVerificationRequiredCode: z.enum(["EMAIL_NOT_VERIFIED"]).nullable(),
});

export const AcceptedResponseSchema = z.strictObject({
  status: z.literal("accepted"),
});

export const NoContentResponseSchema = z.null();

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
export type ResponseEmailVerificationDto = z.infer<typeof ResponseEmailVerificationSchema>;
export type ResponseRegisterUserDto = z.infer<typeof ResponseRegisterUserSchema>;
export type AcceptedResponseDto = z.infer<typeof AcceptedResponseSchema>;

export function toEmailVerificationResponse(
  request: EmailVerificationRequestRow,
): ResponseEmailVerificationDto {
  return {
    verificationId: request.id,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    verifiedAt: request.verifiedAt?.toISOString() ?? null,
  };
}

export function toRegisterUserResponse(input: {
  user: UserRow;
  verificationId: string;
  verificationCode: string | null;
}): ResponseRegisterUserDto {
  return {
    id: input.user.id,
    email: input.user.email,
    displayName: input.user.displayName,
    username: input.user.username,
    userTag: input.user.userTag,
    systemRole: input.user.systemRole,
    status: input.user.status,
    emailVerifiedAt: input.user.emailVerifiedAt?.toISOString() ?? null,
    verificationId: input.verificationId,
    verificationCode: input.verificationCode,
    emailVerificationRequiredCode: input.user.emailVerifiedAt ? null : "EMAIL_NOT_VERIFIED",
  };
}

export function toAuthResponse(session: AuthSession): AuthResponseDto {
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      username: session.user.username,
      userTag: session.user.userTag,
      systemRole: session.user.systemRole,
      status: session.user.status,
      emailVerifiedAt: session.user.emailVerifiedAt?.toISOString() ?? null,
    },
    accessToken: session.accessToken,
    accessExpiresAt: session.accessExpiresAt.toISOString(),
  };
}
