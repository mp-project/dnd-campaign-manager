import { z } from "zod";

import { TrustedDeviceBaseSchema } from "#src/modules/auth/domain/dto/BaseTrustedDeviceDto";
import type { TrustedDeviceView } from "#src/modules/auth/service/AuthService.contracts";

export const ResponseTrustedDeviceListSchema = z.strictObject({
  items: z.array(TrustedDeviceBaseSchema),
});

export type ResponseTrustedDeviceListDto = z.infer<typeof ResponseTrustedDeviceListSchema>;

export function toTrustedDeviceListResponse(devices: TrustedDeviceView[]): ResponseTrustedDeviceListDto {
  return {
    items: devices.map((device) => ({
      id: device.id,
      userAgent: device.userAgent,
      createdAt: device.createdAt.toISOString(),
      lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
      expiresAt: device.expiresAt.toISOString(),
      current: device.current,
    })),
  };
}
