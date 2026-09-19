import { z } from "zod";

type CursorPayload = {
  sortValue: string | number;
  id: string;
};

const cursorPayloadSchema = z.strictObject({
  sortValue: z.union([z.string(), z.number()]),
  id: z.string().uuid(),
});

/**
 * Normalizes sortable values for cursor serialization.
 *
 * @param value Sort value from entity fields.
 * @returns String or number that can be safely encoded into a cursor.
 */
function normalizeSortValue(value: string | number | Date): string | number {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

/**
 * Encodes pagination cursor payload to base64url.
 *
 * @param input Cursor data with sort value and stable id tie-breaker.
 * @returns Opaque cursor string.
 */
export function encodePaginationCursor(input: {
  sortValue: string | number | Date;
  id: string;
}): string {
  const payload: CursorPayload = {
    sortValue: normalizeSortValue(input.sortValue),
    id: input.id,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/**
 * Decodes and validates an opaque pagination cursor.
 *
 * @param cursor Base64url encoded cursor.
 * @returns Parsed cursor payload.
 */
export function decodePaginationCursor(cursor: string): CursorPayload {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const parsed = JSON.parse(decoded) as unknown;

  return cursorPayloadSchema.parse(parsed);
}

/**
 * Creates standard list response envelope used by API list endpoints.
 *
 * @param params List payload and paging metadata.
 * @returns Standardized list response object.
 */
export function createStandardListResponse<T>(params: {
  data: T[];
  limit: number;
  nextCursor: string | null;
  total?: number;
}) {
  return {
    data: params.data,
    pageInfo: {
      limit: params.limit,
      nextCursor: params.nextCursor,
      total: params.total,
    },
  };
}