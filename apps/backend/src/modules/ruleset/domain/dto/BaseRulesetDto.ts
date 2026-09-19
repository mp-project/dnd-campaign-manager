import { z } from "zod";

export const RulesetStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const AssetRulesetCompatibilitySchema = z.enum(["SUPPORTED", "NEUTRAL"]);

export const BaseRulesetWriteSchema = z.strictObject({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000).nullable().optional(),
  editionYear: z.coerce.number().int().min(1900).max(3000),
  sourceReference: z.record(z.string(), z.unknown()).default({}),
  licenseCode: z.string().trim().min(1).max(80),
  attribution: z.string().trim().min(1).max(4000).nullable().optional(),
});

export const RulesetLevelProgressionSchema = z.strictObject({
  characterLevel: z.coerce.number().int().min(1).max(20),
  proficiencyBonus: z.coerce.number().int().min(1),
  experienceThreshold: z.coerce.number().int().nonnegative().nullable(),
});

export const RulesetSpellSlotProgressionSchema = z.strictObject({
  casterLevel: z.coerce.number().int().min(1).max(20),
  slotLevel: z.coerce.number().int().min(1).max(9),
  slotCount: z.coerce.number().int().min(0),
});

export function hasAllCharacterLevels(
  levelProgressions: { characterLevel: number }[],
): boolean {
  const uniqueLevels = new Set(levelProgressions.map((item) => item.characterLevel));

  if (uniqueLevels.size !== 20) {
    return false;
  }

  for (let level = 1; level <= 20; level += 1) {
    if (!uniqueLevels.has(level)) {
      return false;
    }
  }

  return true;
}

export type BaseRulesetDto = z.infer<typeof BaseRulesetWriteSchema>;
