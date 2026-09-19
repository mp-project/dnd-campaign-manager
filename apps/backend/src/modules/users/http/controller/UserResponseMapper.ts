import type {
  EmailVerificationRequestRow,
  UserAggregate,
  UserRow,
  UserSettingsRow,
} from "#src/modules/users/domain/repository/UsersRepository";

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toUuid(value: string | null): string | null {
  return value;
}

export function toUserSettingsResponse(settings: UserSettingsRow) {
  return {
    locale: settings.locale,
    timezone: settings.timezone,
    theme: settings.theme,
    reducedMotion: settings.reducedMotion,
    uiPreferences: settings.uiPreferences,
  };
}

export function toMeResponse(
  aggregate: UserAggregate,
  effectiveGlobalPermissions: string[],
) {
  return {
    id: aggregate.user.id,
    email: aggregate.user.email,
    displayName: aggregate.user.displayName,
    systemRole: aggregate.user.systemRole,
    status: aggregate.user.status,
    emailVerificationRequiredCode: toEmailVerificationRequiredCode(
      aggregate.user.emailVerifiedAt,
    ),
    settings: toUserSettingsResponse(aggregate.settings),
    effectiveGlobalPermissions,
  };
}

export function toAdminUserResponse(user: UserRow) {
  return {
    id: user.id,
    version: user.version,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: toIso(user.deletedAt),
    email: user.email,
    displayName: user.displayName,
    systemRole: user.systemRole,
    status: user.status,
    emailVerifiedAt: toIso(user.emailVerifiedAt),
    lastLoginAt: toIso(user.lastLoginAt),
    createdBy: toUuid(user.createdBy),
    updatedBy: toUuid(user.updatedBy),
  };
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

function toEmailVerificationRequiredCode(
  emailVerifiedAt: Date | null,
): "EMAIL_NOT_VERIFIED" | null {
  return emailVerifiedAt ? null : "EMAIL_NOT_VERIFIED";
}
