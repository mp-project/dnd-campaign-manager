import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";

export const ResponseFieldChangeSchema = z.strictObject({
  seq: z.number().int(),
  eventId: uuidDto,
  actionId: uuidDto,
  action: z.string(),
  entityType: z.string(),
  entityId: uuidDto,
  version: z.number().int(),
  field: z.string(),
  kind: z.string(),
  value: z.unknown(),
  delta: z.number().nullable(),
  redacted: z.boolean(),
  isBaseline: z.boolean(),
  actorId: uuidDto.nullable(),
  reason: z.string().nullable(),
  revertsEventId: uuidDto.nullable(),
  restoredFromVersion: z.number().int().nullable(),
  createdAt: isoDateTimeDto,
  lastChangedAt: isoDateTimeDto,
});

export const ResponseFieldChangePageSchema = z.strictObject({
  data: z.array(ResponseFieldChangeSchema),
  nextBefore: z.number().int().nullable(),
});

export const ResponseEntityVersionSchema = z.strictObject({
  entityType: z.string(),
  entityId: uuidDto,
  version: z.number().int(),
  values: z.record(z.string(), z.unknown()),
  incomplete: z.array(z.string()),
});

export const ResponseHistoryActionSchema = z.strictObject({ actionId: uuidDto });
