import { z } from "zod";

type CursorPayload = {
  sortValue: string | number;
  id: string;
};

const cursorPayloadSchema = z.strictObject({
  sortValue: z.union([z.string(), z.number()]),
  id: z.string().uuid(),
});

function normalizeSortValue(value: string | number | Date): string | number {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

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

export function decodePaginationCursor(cursor: string): CursorPayload {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  const parsed = JSON.parse(decoded) as unknown;

  return cursorPayloadSchema.parse(parsed);
}

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