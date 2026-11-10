import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { BackgroundBaseSchema } from "#src/modules/backgrounds/domain/dto/BaseBackgroundDto";
import { validateBackgroundDefinition } from "#src/modules/backgrounds/domain/BackgroundDefinition";

/**
 * Asset and background are created in one transaction. Scope, campaign and origin follow from the
 * route; `rulesetIds` are only accepted for global backgrounds, custom backgrounds use the ruleset
 * of their campaign. Without `code` it is derived from the name.
 */
export const CreateBackgroundSchema = BackgroundBaseSchema.pick({ name: true })
  .extend({
    code: BackgroundBaseSchema.shape.code.optional(),
    summary: BackgroundBaseSchema.shape.summary.optional(),
    description: BackgroundBaseSchema.shape.description.optional(),
    customizationMode: BackgroundBaseSchema.shape.customizationMode.default("FIXED"),
    displayOrder: BackgroundBaseSchema.shape.displayOrder.default(0),
    status: AssetEditableStatusSchema.default("ACTIVE"),
    releasedToPlayers: BackgroundBaseSchema.shape.releasedToPlayers.default(false),
    sourceReference: BackgroundBaseSchema.shape.sourceReference.optional(),
    rulesetPolicy: BackgroundBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
    rulesetIds: BackgroundBaseSchema.shape.rulesetIds.optional(),
    assetFamilyId: BackgroundBaseSchema.shape.assetFamilyId.optional(),
    sections: BackgroundBaseSchema.shape.sections.default([]),
    abilityRule: BackgroundBaseSchema.shape.abilityRule.default({ mode: "NONE" }),
    proficiencyGrants: BackgroundBaseSchema.shape.proficiencyGrants.default([]),
    featGrants: BackgroundBaseSchema.shape.featGrants.default([]),
    featureGrants: BackgroundBaseSchema.shape.featureGrants.default([]),
    equipmentOptions: BackgroundBaseSchema.shape.equipmentOptions.default([]),
    promptTables: BackgroundBaseSchema.shape.promptTables.default([]),
  })
  .superRefine((value, ctx) => {
    for (const issue of validateBackgroundDefinition(value)) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateBackgroundDto = z.infer<typeof CreateBackgroundSchema>;
