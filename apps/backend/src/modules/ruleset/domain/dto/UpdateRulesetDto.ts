import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import {
  BaseRulesetWriteSchema,
  RulesetStatusSchema,
} from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

const UpdateRulesetMutableFieldsSchema = BaseRulesetWriteSchema
  .pick({
    name: true,
    description: true,
    attribution: true,
  })
  .extend({
    sourceReference: z.record(z.string(), z.unknown()).optional(),
    status: RulesetStatusSchema.optional(),
  })
  .partial();

export const UpdateRulesetSchema = UpdateRulesetMutableFieldsSchema
  .merge(expectedVersionDto)
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.status !== undefined ||
      value.sourceReference !== undefined ||
      value.attribution !== undefined,
    {
      message: "At least one field must be provided for patch updates",
    },
  );

export type UpdateRulesetDto = z.infer<typeof UpdateRulesetSchema>;
