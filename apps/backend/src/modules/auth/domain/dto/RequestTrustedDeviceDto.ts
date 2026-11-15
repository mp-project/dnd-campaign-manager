import { z } from "zod";

import { TrustedDeviceBaseSchema } from "#src/modules/auth/domain/dto/BaseTrustedDeviceDto";

export const TrustedDeviceParamsSchema = z.strictObject({
  deviceId: TrustedDeviceBaseSchema.shape.id,
});

export type TrustedDeviceParamsDto = z.infer<typeof TrustedDeviceParamsSchema>;
