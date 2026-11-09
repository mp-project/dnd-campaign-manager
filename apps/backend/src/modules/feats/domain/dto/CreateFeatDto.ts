import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { FeatBaseSchema } from "#src/modules/feats/domain/dto/BaseFeatDto";
import { validateFeatDefinition } from "#src/modules/feats/domain/FeatDefinition";

/**
 * Asset and feat are created in one transaction. Scope, campaign and origin follow from the route;
 * `rulesetIds` are only accepted for global feats, custom feats use the ruleset of their campaign.
 * Without `code` it is derived from the name; without `repeatability` the feat is taken once.
 */
export const CreateFeatSchema = FeatBaseSchema.pick({ name: true, category: true })
  .extend({
    code: FeatBaseSchema.shape.code.optional(),
    summary: FeatBaseSchema.shape.summary.optional(),
    description: FeatBaseSchema.shape.description.optional(),
    minimumCharacterLevel: FeatBaseSchema.shape.minimumCharacterLevel.default(null),
    prerequisiteCheckMode: FeatBaseSchema.shape.prerequisiteCheckMode.default("ON_ACQUISITION"),
    displayOrder: FeatBaseSchema.shape.displayOrder.default(0),
    status: AssetEditableStatusSchema.default("ACTIVE"),
    releasedToPlayers: FeatBaseSchema.shape.releasedToPlayers.default(false),
    sourceReference: FeatBaseSchema.shape.sourceReference.optional(),
    rulesetPolicy: FeatBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
    rulesetIds: FeatBaseSchema.shape.rulesetIds.optional(),
    assetFamilyId: FeatBaseSchema.shape.assetFamilyId.optional(),
    prerequisites: FeatBaseSchema.shape.prerequisites.default(null),
    repeatability: FeatBaseSchema.shape.repeatability.default({
      mode: "ONCE",
      maximumOccurrences: null,
      repeatabilityChoiceKey: null,
    }),
    choices: FeatBaseSchema.shape.choices.default([]),
    featureGrants: FeatBaseSchema.shape.featureGrants.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of validateFeatDefinition(value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateFeatDto = z.infer<typeof CreateFeatSchema>;
