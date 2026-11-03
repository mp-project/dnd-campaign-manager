import { z } from "zod";

import { baseEntityResponseDto, isoDateTimeDto, uuidDto } from "#core/http/dto";
import { SYSTEM_ROLES } from "#core/permissions/roles";
import {
  emailVerificationStatusEnum,
  userStatusEnum,
  userThemeEnum,
} from "#src/modules/users/domain/entities/UsersTable";

function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * All user fields with their validation rules.
 * Request and response DTOs derive their fields from this schema.
 */
export const UserBaseSchema = baseEntityResponseDto.extend({
  email: z.string().trim().min(3).max(320).email(),
  displayName: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(24)
    .regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])$/),
  userTag: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_-]{1,22}[a-z0-9]#[0-9]{6}$/),
  systemRole: z.enum(SYSTEM_ROLES),
  status: z.enum(userStatusEnum.enumValues),
  emailVerifiedAt: isoDateTimeDto.nullable(),
  lastLoginAt: isoDateTimeDto.nullable(),
});

/**
 * All user settings fields with their validation rules.
 */
export const UserSettingsBaseSchema = z.strictObject({
  locale: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => isValidIanaTimeZone(value), {
      message: "Invalid IANA timezone",
    }),
  theme: z.enum(userThemeEnum.enumValues),
  reducedMotion: z.boolean(),
  uiPreferences: z.record(z.string(), z.unknown()),
});

/**
 * All email verification fields with their validation rules.
 */
export const EmailVerificationBaseSchema = z.strictObject({
  verificationId: uuidDto,
  status: z.enum(emailVerificationStatusEnum.enumValues),
  expiresAt: isoDateTimeDto,
  verifiedAt: isoDateTimeDto.nullable(),
  verificationCode: z.string().regex(/^\d{6}$/),
});

export type UserBaseDto = z.infer<typeof UserBaseSchema>;
export type UserStatus = UserBaseDto["status"];
export type UserSystemRole = UserBaseDto["systemRole"];
export type UserSettingsBaseDto = z.infer<typeof UserSettingsBaseSchema>;
export type UserTheme = UserSettingsBaseDto["theme"];
