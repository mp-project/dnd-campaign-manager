import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";

function toNullableIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toRulesetResponse(rulesetAggregate: RulesetAggregate) {
  const { ruleset, levelProgressions, spellSlotProgressions } = rulesetAggregate;

  return {
    id: ruleset.id,
    version: ruleset.version,
    createdAt: ruleset.createdAt.toISOString(),
    updatedAt: ruleset.updatedAt.toISOString(),
    deletedAt: toNullableIsoString(ruleset.deletedAt),
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
