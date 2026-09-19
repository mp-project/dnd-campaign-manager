import { z } from "zod";

/**
 * Schema for default number where query parameter.
 */
export const DefaultNumberWhereQueryParamSchema = z
  .object({
    eq: z.coerce.number(),
    neq: z.coerce.number(),
    gt: z.coerce.number(),
    gte: z.coerce.number(),
    lt: z.coerce.number(),
    lte: z.coerce.number(),
    in: z.array(z.coerce.number()).min(1),
  })
  .partial()
  .optional();

export type DefaultNumberWhereQueryParam = z.infer<
  typeof DefaultNumberWhereQueryParamSchema
>;
