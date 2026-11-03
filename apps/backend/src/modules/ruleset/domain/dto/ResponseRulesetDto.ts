import { z } from "zod";

import { standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import {
  RulesetBaseSchema,
  RulesetLevelProgressionBaseSchema,
  RulesetSpellSlotProgressionBaseSchema,
} from "#src/modules/ruleset/domain/dto/BaseRulesetDto";
import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";

export const ResponseRulesetSchema = RulesetBaseSchema.extend({
  levelProgressions: z.array(RulesetLevelProgressionBaseSchema),
  spellSlotProgressions: z.array(RulesetSpellSlotProgressionBaseSchema),
});

export const ResponseRulesetListSchema = standardListResponseDto(ResponseRulesetSchema);

export const ResponseValidateRulesetSchema = z.strictObject({
  status: z.literal("ok"),
  rulesetId: uuidDto,
  compatible: z.boolean(),
});

export type ResponseRulesetDto = z.infer<typeof ResponseRulesetSchema>;
export type ResponseRulesetListDto = z.infer<typeof ResponseRulesetListSchema>;
export type ResponseValidateRulesetDto = z.infer<typeof ResponseValidateRulesetSchema>;

export function toRulesetResponse(aggregate: RulesetAggregate): ResponseRulesetDto {
  const { ruleset, levelProgressions, spellSlotProgressions } = aggregate;

  return {
    id: ruleset.id,
    version: ruleset.version,
    createdAt: ruleset.createdAt.toISOString(),
    updatedAt: ruleset.updatedAt.toISOString(),
    deletedAt: ruleset.deletedAt?.toISOString() ?? null,
    createdBy: ruleset.createdBy,
    updatedBy: ruleset.updatedBy,
    code: ruleset.code,
    name: ruleset.name,
    description: ruleset.description,
    status: ruleset.status,
    editionYear: ruleset.editionYear,
    sourceReference: (ruleset.sourceReference ?? {}) as Record<string, unknown>,
    licenseCode: ruleset.licenseCode,
    attribution: ruleset.attribution,
    levelProgressions: levelProgressions.map((item) => ({
      characterLevel: item.characterLevel,
      proficiencyBonus: item.proficiencyBonus,
      experienceThreshold: item.experienceThreshold,
    })),
    spellSlotProgressions: spellSlotProgressions.map((item) => ({
      casterLevel: item.casterLevel,
      slotLevel: item.slotLevel,
      slotCount: item.slotCount,
    })),
  };
}

export function toRulesetListResponse(
  aggregates: RulesetAggregate[],
  limit: number,
  total: number,
): ResponseRulesetListDto {
  return createStandardListResponse({
    data: aggregates.map(toRulesetResponse),
    limit,
    nextCursor: null,
    total,
  });
}
