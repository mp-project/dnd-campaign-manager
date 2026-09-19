import { z } from "zod";

const isoDateTimeStringSchema = z.string().datetime({ offset: true });

/**
 * Schema for default date where query parameter.
 */
export const DefaultDateWhereQueryParamSchema = z
  .object({
    eq: isoDateTimeStringSchema,
    neq: isoDateTimeStringSchema,
    gt: isoDateTimeStringSchema,
    gte: isoDateTimeStringSchema,
    lt: isoDateTimeStringSchema,
    lte: isoDateTimeStringSchema,
  })
  .partial()
  .optional();

export type DefaultDateWhereQueryParam = z.infer<
  typeof DefaultDateWhereQueryParamSchema
>;
