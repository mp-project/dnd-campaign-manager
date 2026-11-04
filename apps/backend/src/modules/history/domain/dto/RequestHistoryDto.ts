import { z } from "zod";

import { booleanQueryDto, uuidDto } from "#core/http/dto";

const reason = z.string().trim().min(1).max(500).optional();

export const RequestHistoryEntityParamsSchema = z.strictObject({
  entityType: z.string().min(1).max(80),
  entityId: uuidDto,
});

export const RequestHistoryVersionParamsSchema = RequestHistoryEntityParamsSchema.extend({
  version: z.coerce.number().int().positive(),
});

export const RequestHistoryEventParamsSchema = z.strictObject({ eventId: uuidDto });
export const RequestHistoryActionParamsSchema = z.strictObject({ actionId: uuidDto });

export const RequestHistoryListQuerySchema = z.strictObject({
  field: z.string().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
  includeChildren: booleanQueryDto.default(false),
});

export const RevertHistoryEventSchema = z.strictObject({
  fields: z.array(z.string().min(1).max(80)).min(1).max(100).optional(),
  reason,
});

export const RevertHistoryActionSchema = z.strictObject({ reason });
export const RestoreHistoryVersionSchema = z.strictObject({ reason });
