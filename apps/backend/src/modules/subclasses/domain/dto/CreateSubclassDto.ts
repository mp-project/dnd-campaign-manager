import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { SubclassBaseSchema } from "#src/modules/subclasses/domain/dto/BaseSubclassDto";
import { validateSubclassDefinition } from "#src/modules/subclasses/domain/SubclassDefinition";

/**
 * Asset and subclass are created in one transaction. Scope, campaign and origin follow from the
 * route; `rulesetIds` are only accepted for global subclasses, custom ones use the ruleset of
 * their campaign. Without a ruleset policy a subclass takes the one of its class (and, for global
 * subclasses, its rulesets). Without `code` it is derived from the name. The rules against the
 * class (levels, keys, spellcasting) are checked when the action ends.
 */
export const CreateSubclassSchema = SubclassBaseSchema.pick({
  name: true,
  classId: true,
})
  .extend({
    code: SubclassBaseSchema.shape.code.optional(),
    summary: SubclassBaseSchema.shape.summary.optional(),
    description: SubclassBaseSchema.shape.description.optional(),
    displayOrder: SubclassBaseSchema.shape.displayOrder.default(0),
    status: AssetEditableStatusSchema.default("ACTIVE"),
    releasedToPlayers: SubclassBaseSchema.shape.releasedToPlayers.default(false),
    sourceReference: SubclassBaseSchema.shape.sourceReference.optional(),
    rulesetPolicy: SubclassBaseSchema.shape.rulesetPolicy.optional(),
    rulesetIds: SubclassBaseSchema.shape.rulesetIds.optional(),
    assetFamilyId: SubclassBaseSchema.shape.assetFamilyId.optional(),
    levels: SubclassBaseSchema.shape.levels.default([]),
    progressionTracks: SubclassBaseSchema.shape.progressionTracks.default([]),
    choices: SubclassBaseSchema.shape.choices.default([]),
    spellcasting: SubclassBaseSchema.shape.spellcasting.default(null),
    spellGrants: SubclassBaseSchema.shape.spellGrants.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of validateSubclassDefinition(value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateSubclassDto = z.infer<typeof CreateSubclassSchema>;
