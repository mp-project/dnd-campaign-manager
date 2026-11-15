import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";

/** A browser or device the user linked as trusted, with its rules. */
export const TrustedDeviceBaseSchema = z.strictObject({
  id: uuidDto,
  userAgent: z.string().max(500).nullable(),
  createdAt: isoDateTimeDto,
  lastUsedAt: isoDateTimeDto.nullable(),
  expiresAt: isoDateTimeDto,
  /** The browser that asks. */
  current: z.boolean(),
});
