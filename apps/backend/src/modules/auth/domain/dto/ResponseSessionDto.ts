import { z } from "zod";

import { SessionBaseSchema } from "#src/modules/auth/domain/dto/BaseSessionDto";
import type { SessionView } from "#src/modules/auth/service/AuthService.contracts";

export const ResponseSessionListSchema = z.strictObject({
  items: z.array(SessionBaseSchema),
});

export type ResponseSessionListDto = z.infer<typeof ResponseSessionListSchema>;

export function toSessionListResponse(sessions: SessionView[]): ResponseSessionListDto {
  return {
    items: sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      startedAt: session.startedAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.current,
    })),
  };
}
