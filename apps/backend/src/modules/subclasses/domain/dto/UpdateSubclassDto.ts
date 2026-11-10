import type { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { expectedAssetVersionDto } from "#src/modules/classes/index";
import { SubclassBaseSchema } from "#src/modules/subclasses/domain/dto/BaseSubclassDto";

/**
 * Both versions come from the last response. Each sent part replaces the stored one as a whole; the
 * definition parts count as one unit in conflict checks, so the definition is never a mix of two
 * versions. The class can't be changed: a subclass of another class is another subclass.
 */
export const UpdateSubclassSchema = SubclassBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  levels: true,
  progressionTracks: true,
  choices: true,
  spellcasting: true,
  spellGrants: true,
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
export const SubclassLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateSubclassDto = z.infer<typeof UpdateSubclassSchema>;
export type SubclassLifecycleCommandDto = z.infer<typeof SubclassLifecycleCommandSchema>;
