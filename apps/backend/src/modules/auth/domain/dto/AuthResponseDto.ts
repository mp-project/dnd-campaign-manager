import { z } from "zod";

import { isoDateTimeDto } from "#core/http/dto";
import {
  EmailVerificationBaseSchema,
  UserBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

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
