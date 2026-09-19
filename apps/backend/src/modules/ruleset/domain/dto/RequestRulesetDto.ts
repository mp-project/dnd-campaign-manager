import { z } from "zod";

import {
  DefaultDateWhereQueryParamSchema,
} from "#core/domain/dto/DefaultDateWhereQueryParamSchema";
import {
  DefaultNumberWhereQueryParamSchema,
} from "#core/domain/dto/DefaultNumberWhereQueryParamSchema";
import {
  DefaultStringWhereQueryParamSchema,
} from "#core/domain/dto/DefaultStringWhereQueryParamSchema";
import { paginationDto, uuidDto } from "#core/http/dto";
import { RulesetStatusSchema } from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

export const RulesetStatusWhereQueryParamSchema = z
  .object({
    eq: RulesetStatusSchema,
    neq: RulesetStatusSchema,
    in: z.array(RulesetStatusSchema).min(1),
  })
  .partial()
  .optional();

// Allowed where fields for URL-driven filtering in ruleset list requests.
export const DefaultRulesetWhereSchema = z
  .object({
    code: DefaultStringWhereQueryParamSchema,
    name: DefaultStringWhereQueryParamSchema,
    status: RulesetStatusWhereQueryParamSchema,
    editionYear: DefaultNumberWhereQueryParamSchema,
    createdAt: DefaultDateWhereQueryParamSchema,
    updatedAt: DefaultDateWhereQueryParamSchema,
    deletedAt: DefaultDateWhereQueryParamSchema,
  })
  .partial()
  .optional();

const RequestRulesetListFilterSchema = z.strictObject({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/).optional(),
  status: RulesetStatusSchema.optional(),
  editionYear: z.coerce.number().int().min(1900).max(3000).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  includeArchived: z.coerce.boolean().default(false),
  where: DefaultRulesetWhereSchema,
});

export const RequestRulesetListQuerySchema =
  RequestRulesetListFilterSchema.merge(paginationDto);

export const RequestRulesetParamsSchema = z.strictObject({
  rulesetId: uuidDto,
});

export type RequestRulesetDto = {
  query: z.infer<typeof RequestRulesetListQuerySchema>;
  params: z.infer<typeof RequestRulesetParamsSchema>;
};
