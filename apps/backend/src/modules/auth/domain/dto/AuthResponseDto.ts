import { z } from "zod";

import { isoDateTimeDto } from "#core/http/dto";
import { UserBaseSchema } from "#src/modules/users/domain/dto/BaseUsersDto";
import type { UserRow } from "#src/modules/auth/domain/repository/AuthRepository";
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

export const AcceptedResponseSchema = z.strictObject({
  status: z.literal("accepted"),
});

export const NoContentResponseSchema = z.null();

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
export type AuthUserProfileDto = z.infer<typeof AuthUserProfileSchema>;
export type AcceptedResponseDto = z.infer<typeof AcceptedResponseSchema>;

export function toAuthUserProfile(user: UserRow): AuthUserProfileDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    userTag: user.userTag,
    systemRole: user.systemRole,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
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
