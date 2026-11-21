import { z } from "zod";

import { standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import {
  UserBaseSchema,
  UserSettingsBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";
import type {
  UserAggregate,
  UserRow,
  UserSettingsRow,
} from "#src/modules/users/domain/repository/UsersRepository";

/**
 * Locale and timezone keep looser rules than the input: a stored timezone that a later runtime no
 * longer knows must not make `/me` fail.
 */
export const ResponseUserSettingsSchema = UserSettingsBaseSchema.extend({
  locale: z.string().min(2).max(12),
  timezone: z.string().min(1).max(80),
});

export const ResponseMeSchema = UserBaseSchema.pick({
  id: true,
  email: true,
  displayName: true,
  username: true,
  userTag: true,
  systemRole: true,
  status: true,
}).extend({
  emailVerificationRequiredCode: z.enum(["EMAIL_NOT_VERIFIED"]).nullable(),
  settings: ResponseUserSettingsSchema,
  effectiveGlobalPermissions: z.array(z.string().min(1)),
});

/**
 * Full user view for system admins.
 */
export const ResponseUserSchema = UserBaseSchema;

/**
 * Reduced user view for everyone else.
 */
export const ResponseLimitedUserSchema = UserBaseSchema.pick({
  userTag: true,
  displayName: true,
});

export const ResponseReadableUserSchema = z.union([
  ResponseUserSchema,
  ResponseLimitedUserSchema,
]);

export const ResponseReadableUserListSchema = standardListResponseDto(
  ResponseReadableUserSchema,
);

const ResponseMeCampaignItemSchema = z.strictObject({
  campaignId: uuidDto,
  role: z.enum(["OWNER", "EDITOR", "PLAYER"]),
  source: z.enum(["owned", "managed", "joined"]),
});

export const ResponseMeCampaignOverviewSchema = z.strictObject({
  ownedOrManaged: z.array(ResponseMeCampaignItemSchema),
  joined: z.array(ResponseMeCampaignItemSchema),
});

export type ResponseMeDto = z.infer<typeof ResponseMeSchema>;
export type ResponseUserDto = z.infer<typeof ResponseUserSchema>;
export type ResponseReadableUserDto = z.infer<typeof ResponseReadableUserSchema>;
export type ResponseReadableUserListDto = z.infer<typeof ResponseReadableUserListSchema>;
export type ResponseMeCampaignOverviewDto = z.infer<typeof ResponseMeCampaignOverviewSchema>;

function toUserSettingsResponse(settings: UserSettingsRow) {
  return {
    locale: settings.locale,
    timezone: settings.timezone,
    theme: settings.theme,
    reducedMotion: settings.reducedMotion,
    uiPreferences: settings.uiPreferences as Record<string, unknown>,
  };
}

export function toMeResponse(
  aggregate: UserAggregate,
  effectiveGlobalPermissions: string[],
): ResponseMeDto {
  const { user, settings } = aggregate;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    userTag: user.userTag,
    systemRole: user.systemRole,
    status: user.status,
    emailVerificationRequiredCode: user.emailVerifiedAt ? null : "EMAIL_NOT_VERIFIED",
    settings: toUserSettingsResponse(settings),
    effectiveGlobalPermissions,
  };
}

export function toUserResponse(user: UserRow): ResponseUserDto {
  return {
    id: user.id,
    version: user.version,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    deletedAt: user.deletedAt?.toISOString() ?? null,
    createdBy: user.createdBy,
    updatedBy: user.updatedBy,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
    userTag: user.userTag,
    systemRole: user.systemRole,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

export function toReadableUserResponse(
  user: UserRow,
  canReadFull: boolean,
): ResponseReadableUserDto {
  return canReadFull
    ? toUserResponse(user)
    : { userTag: user.userTag, displayName: user.displayName };
}

export function toReadableUserListResponse(
  users: UserRow[],
  canReadFull: boolean,
  limit: number,
  total: number,
): ResponseReadableUserListDto {
  return createStandardListResponse({
    data: users.map((user) => toReadableUserResponse(user, canReadFull)),
    limit,
    nextCursor: null,
    total,
  });
}
