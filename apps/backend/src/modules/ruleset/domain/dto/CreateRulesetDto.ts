import { z } from "zod";

import {
  RulesetBaseSchema,
  RulesetLevelProgressionBaseSchema,
  RulesetSpellSlotProgressionBaseSchema,
} from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

function hasAllCharacterLevels(levelProgressions: { characterLevel: number }[]): boolean {
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

export const CreateRulesetSchema = RulesetBaseSchema.pick({
  code: true,
  name: true,
  description: true,
  editionYear: true,
  licenseCode: true,
  attribution: true,
})
  .partial({ description: true, attribution: true })
  .extend({
    sourceReference: RulesetBaseSchema.shape.sourceReference.default({}),
    levelProgressions: z
      .array(RulesetLevelProgressionBaseSchema)
      .length(20)
      .refine(hasAllCharacterLevels, {
        message:
          "levelProgressions must contain each character level from 1 to 20 exactly once",
      }),
    spellSlotProgressions: z
      .array(RulesetSpellSlotProgressionBaseSchema)
      .min(1)
      .refine(
        (items) => {
          const keys = new Set(items.map((item) => `${item.casterLevel}:${item.slotLevel}`));

          return keys.size === items.length;
        },
        {
          message:
            "spellSlotProgressions contains duplicate casterLevel/slotLevel combinations",
        },
      ),
  })
  .transform((value) => ({
    ...value,
    description: value.description ?? null,
    attribution: value.attribution ?? null,
  }));

export type CreateRulesetDto = z.infer<typeof CreateRulesetSchema>;
