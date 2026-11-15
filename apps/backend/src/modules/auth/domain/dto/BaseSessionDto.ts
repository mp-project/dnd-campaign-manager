import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";

/** One signed-in browser or device (a refresh token family) with its rules. */
export const SessionBaseSchema = z.strictObject({
  id: uuidDto,
  userAgent: z.string().max(500).nullable(),
  startedAt: isoDateTimeDto,
  lastActiveAt: isoDateTimeDto,
  expiresAt: isoDateTimeDto,
  /** The session of the browser that asks. */
  current: z.boolean(),
});
