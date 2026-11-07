import { z } from "zod";

import { isoDateTimeDto } from "#core/http/dto";
import {
  EmailVerificationBaseSchema,
  UserBaseSchema,
} from "#src/modules/users/domain/dto/BaseUsersDto";

export const RequestEmailChangeSchema = UserBaseSchema.pick({ email: true }).extend({
  // Required whenever the account has a password; OAuth-only accounts have none.
  currentPassword: z.string().min(1).max(200).optional(),
});

export const ConfirmEmailChangeSchema = EmailVerificationBaseSchema.pick({
  verificationCode: true,
});

export const ConfirmEmailChangeLinkQuerySchema = z.strictObject({
  token: z.string().min(1).max(4096),
});

export const ResponseEmailChangeRequestSchema = z.strictObject({
  pendingEmail: UserBaseSchema.shape.email,
  expiresAt: isoDateTimeDto,
});

export type RequestEmailChangeDto = z.infer<typeof RequestEmailChangeSchema>;
export type ConfirmEmailChangeDto = z.infer<typeof ConfirmEmailChangeSchema>;
export type ResponseEmailChangeRequestDto = z.infer<typeof ResponseEmailChangeRequestSchema>;

export function toEmailChangeRequestResponse(input: {
  pendingEmail: string;
  expiresAt: Date;
}): ResponseEmailChangeRequestDto {
  return {
    pendingEmail: input.pendingEmail,
    expiresAt: input.expiresAt.toISOString(),
  };
}
