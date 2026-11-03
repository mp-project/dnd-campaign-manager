import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { RulesetBaseSchema } from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

export const UpdateRulesetSchema = RulesetBaseSchema.pick({
  name: true,
  description: true,
  attribution: true,
  sourceReference: true,
  status: true,
})
  .partial()
  .extend(expectedVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([field, fieldValue]) => field !== "expectedVersion" && fieldValue !== undefined,
      ),
    { message: "At least one field must be provided for patch updates" },
  );

export type UpdateRulesetDto = z.infer<typeof UpdateRulesetSchema>;
