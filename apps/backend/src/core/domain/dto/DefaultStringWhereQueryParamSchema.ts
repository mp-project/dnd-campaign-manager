import { z } from "zod";

/**
 * Schema for default string where query parameter.
 */
export const DefaultStringWhereQueryParamSchema = z
  .object({
    eq: z.string().trim().min(1),
    neq: z.string().trim().min(1),
    like: z.string().trim().min(1),
    in: z.array(z.string().trim().min(1)).min(1),
  })
  .partial()
  .optional();

export type DefaultStringWhereQueryParam = z.infer<
  typeof DefaultStringWhereQueryParamSchema
>;
