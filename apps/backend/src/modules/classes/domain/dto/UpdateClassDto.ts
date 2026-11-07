import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { ClassBaseSchema } from "#src/modules/classes/domain/dto/BaseClassDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Each sent part replaces the stored one as a whole. The
 * definition parts and level settings count as one unit in conflict checks: a change by somebody
 * else to any of them makes a change to any other a conflict (412), so the definition is never a
 * mix of two versions. A new `maximumLevel` needs `levels` with matching entries.
 */
export const UpdateClassSchema = ClassBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  maximumLevel: true,
  hitDie: true,
  firstLevelHitPoints: true,
  fixedHitPointsPerLevel: true,
  subclassSelectionLevel: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  primaryAbilities: true,
  proficiencies: true,
  startingEquipment: true,
  progressionTracks: true,
  levels: true,
  choices: true,
  spellcasting: true,
  multiclass: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, fieldValue]) =>
          key !== "expectedVersion" && key !== "expectedAssetVersion" && fieldValue !== undefined,
      ),
    { message: "At least one field must be provided for patch updates" },
  );

/** Deleting archives the asset and restoring brings it back, so both use the asset version. */
export const ClassLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateClassDto = z.infer<typeof UpdateClassSchema>;
export type ClassLifecycleCommandDto = z.infer<typeof ClassLifecycleCommandSchema>;
