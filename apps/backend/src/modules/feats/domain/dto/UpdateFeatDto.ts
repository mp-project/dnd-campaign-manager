import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { FeatBaseSchema } from "#src/modules/feats/domain/dto/BaseFeatDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Each sent part replaces the stored one as a whole
 * (`PUT` of a sub-resource in other APIs). The definition parts count as one unit in conflict
 * checks: a change by somebody else to any of them makes a change to any other a conflict (412),
 * so the definition is never a mix of two versions.
 */
export const UpdateFeatSchema = FeatBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  category: true,
  minimumCharacterLevel: true,
  prerequisiteCheckMode: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  prerequisites: true,
  repeatability: true,
  choices: true,
  featureGrants: true,
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
export const FeatLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateFeatDto = z.infer<typeof UpdateFeatSchema>;
export type FeatLifecycleCommandDto = z.infer<typeof FeatLifecycleCommandSchema>;
