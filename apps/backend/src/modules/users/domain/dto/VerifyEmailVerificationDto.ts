import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { UserEmailSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const VerifyEmailVerificationSchema = z.strictObject({
  email: UserEmailSchema,
  verificationId: uuidDto,
  verificationCode: z.string().regex(/^\d{6}$/),
});

export type VerifyEmailVerificationDto = z.infer<
  typeof VerifyEmailVerificationSchema
>;
