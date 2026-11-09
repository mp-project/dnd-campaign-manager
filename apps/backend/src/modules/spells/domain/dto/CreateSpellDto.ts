import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { SpellBaseSchema, SpellListBaseSchema } from "#src/modules/spells/domain/dto/BaseSpellDto";
import { validateSpellDefinition } from "#src/modules/spells/domain/SpellDefinition";

/** Asset fields of a create request; scope, campaign and origin follow from the route. */
const assetCreateShape = {
  summary: SpellBaseSchema.shape.summary.optional(),
  status: AssetEditableStatusSchema.default("ACTIVE"),
  releasedToPlayers: SpellBaseSchema.shape.releasedToPlayers.default(false),
  sourceReference: SpellBaseSchema.shape.sourceReference.optional(),
  rulesetPolicy: SpellBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
  /** Global content only; custom content uses the ruleset of its campaign. */
  rulesetIds: SpellBaseSchema.shape.rulesetIds.optional(),
  assetFamilyId: SpellBaseSchema.shape.assetFamilyId.optional(),
};

/**
 * Asset and spell are created in one transaction. Without `code` it is derived from the name. A
 * spell needs a description, a section or an effect; the other rules across fields are those of
 * `validateSpellDefinition`, references are checked at the end of the action.
 */
export const CreateSpellSchema = SpellBaseSchema.pick({
  name: true,
  level: true,
  school: true,
  castingTimeType: true,
  rangeType: true,
  durationType: true,
})
  .extend({
    ...assetCreateShape,
    code: SpellBaseSchema.shape.code.optional(),
    description: SpellBaseSchema.shape.description.default(null),
    higherLevelDescription: SpellBaseSchema.shape.higherLevelDescription.default(null),
    isRitual: SpellBaseSchema.shape.isRitual.default(false),
    castingTimeAmount: SpellBaseSchema.shape.castingTimeAmount.default(1),
    castingTrigger: SpellBaseSchema.shape.castingTrigger.default(null),
    rangeDistance: SpellBaseSchema.shape.rangeDistance.default(null),
    rangeUnit: SpellBaseSchema.shape.rangeUnit.default(null),
    durationAmount: SpellBaseSchema.shape.durationAmount.default(null),
    durationUnit: SpellBaseSchema.shape.durationUnit.default(null),
    requiresConcentration: SpellBaseSchema.shape.requiresConcentration.default(false),
    componentVerbal: SpellBaseSchema.shape.componentVerbal.default(false),
    componentSomatic: SpellBaseSchema.shape.componentSomatic.default(false),
    componentMaterial: SpellBaseSchema.shape.componentMaterial.default(false),
    sections: SpellBaseSchema.shape.sections.default([]),
    materials: SpellBaseSchema.shape.materials.default([]),
    requirements: SpellBaseSchema.shape.requirements.default([]),
    targets: SpellBaseSchema.shape.targets.default([]),
    choices: SpellBaseSchema.shape.choices.default([]),
    scalingTracks: SpellBaseSchema.shape.scalingTracks.default([]),
    effects: SpellBaseSchema.shape.effects.default([]),
    spellListIds: SpellBaseSchema.shape.spellListIds.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of validateSpellDefinition(value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateSpellDto = z.infer<typeof CreateSpellSchema>;

export const CreateSpellListSchema = SpellListBaseSchema.pick({ name: true }).extend({
  ...assetCreateShape,
  code: SpellListBaseSchema.shape.code.optional(),
  description: SpellListBaseSchema.shape.description.default(null),
  spellIds: SpellListBaseSchema.shape.spellIds.default([]),
});

export type CreateSpellListDto = z.infer<typeof CreateSpellListSchema>;
