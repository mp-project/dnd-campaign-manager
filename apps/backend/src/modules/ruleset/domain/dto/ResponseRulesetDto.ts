import { z } from "zod";

import {
  baseEntityResponseDto,
  standardListResponseDto,
  uuidDto,
} from "#core/http/dto";
import {
  RulesetLevelProgressionSchema,
  RulesetSpellSlotProgressionSchema,
  RulesetStatusSchema,
} from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

export const ResponseRulesetSchema = baseEntityResponseDto.extend({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().nullable(),
  status: RulesetStatusSchema,
  editionYear: z.number().int(),
  sourceReference: z.record(z.string(), z.unknown()),
  licenseCode: z.string().min(1).max(80),
  attribution: z.string().nullable(),
  levelProgressions: z.array(RulesetLevelProgressionSchema),
  spellSlotProgressions: z.array(RulesetSpellSlotProgressionSchema),
});

export const ResponseRulesetListSchema = standardListResponseDto(ResponseRulesetSchema);

export const ResponseValidateRulesetSchema = z.strictObject({
  status: z.literal("ok"),
  rulesetId: uuidDto,
  compatible: z.boolean(),
});

export type ResponseRulesetDto = z.infer<typeof ResponseRulesetSchema>;
