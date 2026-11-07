import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { ClassBaseSchema } from "#src/modules/classes/domain/dto/BaseClassDto";
import type { ClassLevel } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { validateClassDefinition } from "#src/modules/classes/domain/ClassDefinition";
import { CLASS_MAX_LEVEL } from "#src/modules/classes/domain/entities/ClassesTable";

/** Levels 1 to the maximum; sent entries keep their grants, missing levels get none. */
export function fillLevels(maximumLevel: number, levels: readonly ClassLevel[] | undefined): ClassLevel[] {
  if (levels === undefined) {
    return Array.from({ length: maximumLevel }, (_, index) => ({ level: index + 1, featureGrants: [] }));
  }

  return [...levels];
}

/**
 * Asset and class are created in one transaction. Scope, campaign and origin follow from the
 * route; `rulesetIds` are only accepted for global classes, custom classes use the ruleset of their
 * campaign. Without `code` it is derived from the name; without `levels` every level starts empty.
 */
export const CreateClassSchema = ClassBaseSchema.pick({
  name: true,
  hitDie: true,
  firstLevelHitPoints: true,
  fixedHitPointsPerLevel: true,
  subclassSelectionLevel: true,
  primaryAbilities: true,
})
  .extend({
    code: ClassBaseSchema.shape.code.optional(),
    summary: ClassBaseSchema.shape.summary.optional(),
    description: ClassBaseSchema.shape.description.optional(),
    maximumLevel: ClassBaseSchema.shape.maximumLevel.default(CLASS_MAX_LEVEL),
    displayOrder: ClassBaseSchema.shape.displayOrder.default(0),
    status: AssetEditableStatusSchema.default("ACTIVE"),
    releasedToPlayers: ClassBaseSchema.shape.releasedToPlayers.default(false),
    sourceReference: ClassBaseSchema.shape.sourceReference.optional(),
    rulesetPolicy: ClassBaseSchema.shape.rulesetPolicy.default("NEUTRAL"),
    rulesetIds: ClassBaseSchema.shape.rulesetIds.optional(),
    assetFamilyId: ClassBaseSchema.shape.assetFamilyId.optional(),
    proficiencies: ClassBaseSchema.shape.proficiencies.default([]),
    startingEquipment: ClassBaseSchema.shape.startingEquipment.default([]),
    progressionTracks: ClassBaseSchema.shape.progressionTracks.default([]),
    levels: ClassBaseSchema.shape.levels.optional(),
    choices: ClassBaseSchema.shape.choices.default([]),
    spellcasting: ClassBaseSchema.shape.spellcasting.default(null),
    multiclass: ClassBaseSchema.shape.multiclass.default({ combinationMode: "ALL", abilityRequirements: [] }),
  })
  .superRefine((value, ctx) => {
    const issues = validateClassDefinition(value, {
      ...value,
      levels: fillLevels(value.maximumLevel, value.levels),
    });

    for (const issue of issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateClassDto = z.infer<typeof CreateClassSchema>;
