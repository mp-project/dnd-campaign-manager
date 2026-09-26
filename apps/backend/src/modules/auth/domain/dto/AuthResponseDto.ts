import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import {
  EmailVerificationStatusSchema,
  UserStatusSchema,
  UserSystemRoleSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const AuthUserProfileSchema = z.strictObject({
  id: uuidDto,
  email: z.string().email(),
  displayName: z.string().min(1).max(120),
  systemRole: UserSystemRoleSchema,
  status: UserStatusSchema,
  emailVerifiedAt: isoDateTimeDto.nullable(),
});

export const AuthResponseSchema = z.strictObject({
  user: AuthUserProfileSchema,
  accessToken: z.string().min(1),
  accessExpiresAt: isoDateTimeDto,
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

export const AcceptedResponseSchema = z.strictObject({
  status: z.literal("accepted"),
});

export const NoContentResponseSchema = z.null();

export type AuthResponseDto = z.infer<typeof AuthResponseSchema>;
