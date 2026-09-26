import type {
  AuthSession,
  RegisterUserResult,
} from "#src/modules/auth/service/AuthService";
import type { EmailVerificationRequestRow, UserRow } from "#src/modules/auth/domain/repository/AuthRepository";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toEmailVerificationResponse(request: EmailVerificationRequestRow) {
  return {
    verificationId: request.id,
    status: request.status,
    expiresAt: request.expiresAt.toISOString(),
    verifiedAt: toIso(request.verifiedAt),
  };
}

export function toRegisterUserResponse(input: {
  user: UserRow;
  verificationId: string;
  verificationCode: string | null;
}) {
  return {
    id: input.user.id,
    email: input.user.email,
    displayName: input.user.displayName,
    systemRole: input.user.systemRole,
    status: input.user.status,
    emailVerifiedAt: toIso(input.user.emailVerifiedAt),
    verificationId: input.verificationId,
    verificationCode: input.verificationCode,
    emailVerificationRequiredCode: toEmailVerificationRequiredCode(
      input.user.emailVerifiedAt,
    ),
  };
}

export function toRegisterUserResponseFromResult(result: RegisterUserResult) {
  return toRegisterUserResponse({
    user: result.user,
    verificationId: result.verificationRequest.id,
    verificationCode: result.verificationCode,
  });
}

export function toAuthResponse(session: AuthSession) {
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      displayName: session.user.displayName,
      systemRole: session.user.systemRole,
      status: session.user.status,
      emailVerifiedAt: toIso(session.user.emailVerifiedAt),
    },
    accessToken: session.accessToken,
    accessExpiresAt: session.accessExpiresAt.toISOString(),
  };
}

function toEmailVerificationRequiredCode(
  emailVerifiedAt: Date | null,
): "EMAIL_NOT_VERIFIED" | null {
  return emailVerifiedAt ? null : "EMAIL_NOT_VERIFIED";
}
