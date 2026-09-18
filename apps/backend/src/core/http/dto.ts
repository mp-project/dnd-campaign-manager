import { z } from "zod";

import { domainErrorCodes } from "./domain-errors.js";

export const uuidDto = z.string().uuid();

export const slugDto = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const isoDateTimeDto = z.string().datetime({ offset: true });

export const paginationDto = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const sortDto = z.strictObject({
  sortBy: z.string().min(1).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
});

export const baseEntityResponseDto = z.strictObject({
  id: uuidDto,
  version: z.number().int().positive(),
  createdAt: isoDateTimeDto,
  updatedAt: isoDateTimeDto,
  deletedAt: isoDateTimeDto.nullable(),
});

export const expectedVersionDto = z.strictObject({
  expectedVersion: z.coerce.number().int().positive(),
});

export function nonEmptyPatch<T extends z.ZodRawShape>(shape: T) {
  return z
    .strictObject(shape)
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field must be provided for patch updates",
    });
}

export const pageInfoDto = z.strictObject({
  limit: z.number().int().positive(),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative().optional(),
});

export function standardListResponseDto<T extends z.ZodTypeAny>(itemDto: T) {
  return z.strictObject({
    data: z.array(itemDto),
    pageInfo: pageInfoDto,
  });
}

export const domainErrorCodeDto = z.enum(domainErrorCodes);

export const errorResponseDto = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().nullable(),
    requestId: z.string().min(1),
  }),
});

export const healthResponseDto = z.strictObject({
  status: z.literal("ok"),
});

export const readyResponseDto = z.strictObject({
  status: z.literal("ready"),
});

export const apiBaseResponseDto = z.strictObject({
  status: z.literal("ok"),
  basePath: z.literal("/api/v1"),
});

export const pingResponseDto = z.strictObject({
  status: z.literal("pong"),
});