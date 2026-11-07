import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { FeatureBaseSchema } from "#src/modules/features/domain/dto/BaseFeatureDto";
import { validateFeatureDefinition } from "#src/modules/features/domain/FeatureDefinition";

/** Graph parts default to empty lists, so a plain rule text is a valid feature. */
export const FeatureGraphInputShape = {
  sections: FeatureBaseSchema.shape.sections.default([]),
  parameters: FeatureBaseSchema.shape.parameters.default([]),
  choices: FeatureBaseSchema.shape.choices.default([]),
  resources: FeatureBaseSchema.shape.resources.default([]),
  scalingTracks: FeatureBaseSchema.shape.scalingTracks.default([]),
  activations: FeatureBaseSchema.shape.activations.default([]),
  effects: FeatureBaseSchema.shape.effects.default([]),
  supersedes: FeatureBaseSchema.shape.supersedes.default([]),
};

/**
 * Asset and feature are created in one transaction. Scope, campaign and origin follow from the
 * route; `rulesetIds` are only accepted for global features, custom features use the ruleset of
 * their campaign. Without `code` it is derived from the name.
 */
export const CreateFeatureSchema = FeatureBaseSchema.pick({
  name: true,
  featureType: true,
})
  .extend({
    code: FeatureBaseSchema.shape.code.optional(),
    summary: FeatureBaseSchema.shape.summary.optional(),
    description: FeatureBaseSchema.shape.description.optional(),
    status: AssetEditableStatusSchema.default("ACTIVE"),
    releasedToPlayers: FeatureBaseSchema.shape.releasedToPlayers.default(false),
    stackingMode: FeatureBaseSchema.shape.stackingMode.default("NONE"),
    sourceReference: FeatureBaseSchema.shape.sourceReference.optional(),
    rulesetPolicy: FeatureBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
    rulesetIds: FeatureBaseSchema.shape.rulesetIds.optional(),
    assetFamilyId: FeatureBaseSchema.shape.assetFamilyId.optional(),
  })
  .extend(FeatureGraphInputShape)
  .superRefine((value, ctx) => {
    for (const issue of validateFeatureDefinition(value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateFeatureDto = z.infer<typeof CreateFeatureSchema>;
