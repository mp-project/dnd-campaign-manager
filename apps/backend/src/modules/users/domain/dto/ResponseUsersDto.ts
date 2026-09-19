import { z } from "zod";

import {
  baseEntityResponseDto,
  isoDateTimeDto,
  standardListResponseDto,
  uuidDto,
} from "#core/http/dto";
import {
  EmailVerificationStatusSchema,
  UserStatusSchema,
  UserSystemRoleSchema,
  UserThemeSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const ResponseUserSettingsSchema = z.strictObject({
  locale: z.string().min(2).max(12),
  timezone: z.string().min(1).max(80),
  theme: UserThemeSchema,
  reducedMotion: z.boolean(),
  uiPreferences: z.record(z.string(), z.unknown()),
});

export const ResponseMeSchema = z.strictObject({
  id: uuidDto,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  systemRole: UserSystemRoleSchema,
  status: UserStatusSchema,
  emailVerificationRequiredCode: z
    .enum(["EMAIL_NOT_VERIFIED"])
    .nullable(),
  settings: ResponseUserSettingsSchema,
  effectiveGlobalPermissions: z.array(z.string().min(1)),
});

export const ResponseAdminUserSchema = baseEntityResponseDto.extend({
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  systemRole: UserSystemRoleSchema,
  status: UserStatusSchema,
  emailVerifiedAt: isoDateTimeDto.nullable(),
  lastLoginAt: isoDateTimeDto.nullable(),
});

export const ResponseAdminUserListSchema = standardListResponseDto(
  ResponseAdminUserSchema,
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

const ResponseInvitationSchema = z.strictObject({
  invitationId: uuidDto,
  campaignId: uuidDto,
  role: z.enum(["EDITOR", "PLAYER"]),
  invitedAt: isoDateTimeDto,
});

export const ResponseMeInvitationsSchema = z.strictObject({
  data: z.array(ResponseInvitationSchema),
});

export const ResponseEmailVerificationSchema = z.strictObject({
  verificationId: uuidDto,
  status: EmailVerificationStatusSchema,
  expiresAt: isoDateTimeDto,
  verifiedAt: isoDateTimeDto.nullable(),
});

export const ResponseRegisterUserSchema = z.strictObject({
  id: uuidDto,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  systemRole: UserSystemRoleSchema,
  status: UserStatusSchema,
  emailVerifiedAt: isoDateTimeDto.nullable(),
  verificationId: uuidDto,
  verificationCode: z.string().regex(/^\d{6}$/).nullable(),
  emailVerificationRequiredCode: z
    .enum(["EMAIL_NOT_VERIFIED"])
    .nullable(),
});

export type ResponseMeDto = z.infer<typeof ResponseMeSchema>;
