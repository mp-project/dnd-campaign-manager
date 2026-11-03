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
import { RulesetBaseSchema } from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

const RulesetStatusSchema = RulesetBaseSchema.shape.status;

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
  code: RulesetBaseSchema.shape.code.optional(),
  status: RulesetStatusSchema.optional(),
  editionYear: RulesetBaseSchema.shape.editionYear.optional(),
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
