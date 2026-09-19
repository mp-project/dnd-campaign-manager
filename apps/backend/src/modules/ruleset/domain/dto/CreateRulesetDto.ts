import { z } from "zod";

import {
  BaseRulesetWriteSchema,
  hasAllCharacterLevels,
  RulesetLevelProgressionSchema,
  RulesetSpellSlotProgressionSchema,
} from "#src/modules/ruleset/domain/dto/BaseRulesetDto";

export const CreateRulesetSchema = BaseRulesetWriteSchema.extend({
  levelProgressions: z
    .array(RulesetLevelProgressionSchema)
    .length(20)
    .refine(hasAllCharacterLevels, {
      message:
        "levelProgressions must contain each character level from 1 to 20 exactly once",
    }),
  spellSlotProgressions: z
    .array(RulesetSpellSlotProgressionSchema)
    .min(1)
    .refine((items) => {
      const keys = new Set(
        items.map((item) => `${item.casterLevel}:${item.slotLevel}`),
      );

      return keys.size === items.length;
    }, {
      message:
        "spellSlotProgressions contains duplicate casterLevel/slotLevel combinations",
    }),
}).transform((value) => ({
  ...value,
  description: value.description ?? null,
  attribution: value.attribution ?? null,
}));

export type CreateRulesetDto = z.infer<typeof CreateRulesetSchema>;
