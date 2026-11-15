import { z } from "zod";

import { SessionBaseSchema } from "#src/modules/auth/domain/dto/BaseSessionDto";

export const SessionParamsSchema = z.strictObject({
  sessionId: SessionBaseSchema.shape.id,
});

export type SessionParamsDto = z.infer<typeof SessionParamsSchema>;
