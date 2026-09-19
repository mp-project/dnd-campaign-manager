import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { UserEmailSchema } from "#src/modules/users/domain/dto/BaseUsersDto";

export const RequestEmailVerificationSchema = z.strictObject({
  email: UserEmailSchema,
});

export const RequestEmailVerificationStatusParamsSchema = z.strictObject({
  verificationId: uuidDto,
});

export type RequestEmailVerificationDto = z.infer<
  typeof RequestEmailVerificationSchema
>;
