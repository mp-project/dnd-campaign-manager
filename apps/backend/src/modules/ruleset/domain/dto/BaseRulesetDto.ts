import { z } from "zod";

import { baseEntityResponseDto } from "#core/http/dto";
import { rulesetStatusEnum } from "#src/modules/ruleset/domain/entities/RulesetTable";

/**
 * All ruleset fields with their validation rules.
 * Request and response DTOs derive their fields from this schema.
 */
export const RulesetBaseSchema = baseEntityResponseDto.extend({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000).nullable(),
  status: z.enum(rulesetStatusEnum.enumValues),
  editionYear: z.coerce.number().int().min(1900).max(3000),
  sourceReference: z.record(z.string(), z.unknown()),
  licenseCode: z.string().trim().min(1).max(80),
  attribution: z.string().trim().min(1).max(4000).nullable(),
});

export const RulesetLevelProgressionBaseSchema = z.strictObject({
  characterLevel: z.coerce.number().int().min(1).max(20),
  proficiencyBonus: z.coerce.number().int().min(1),
  experienceThreshold: z.coerce.number().int().nonnegative().nullable(),
});

export const RulesetSpellSlotProgressionBaseSchema = z.strictObject({
  casterLevel: z.coerce.number().int().min(1).max(20),
  slotLevel: z.coerce.number().int().min(1).max(9),
  slotCount: z.coerce.number().int().min(0),
});

export type RulesetBaseDto = z.infer<typeof RulesetBaseSchema>;
export type RulesetStatus = RulesetBaseDto["status"];
