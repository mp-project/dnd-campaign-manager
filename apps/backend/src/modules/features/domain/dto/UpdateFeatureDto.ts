import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { FeatureBaseSchema } from "#src/modules/features/domain/dto/BaseFeatureDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Each sent graph part replaces the stored one as a
 * whole. The rule parts (parameters to supersedes) count as one unit in conflict checks: a change
 * by somebody else to any of them makes a change to any other a conflict (412), so the definition
 * is never a mix of two versions.
 */
export const UpdateFeatureSchema = FeatureBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  featureType: true,
  description: true,
  stackingMode: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  sections: true,
  parameters: true,
  choices: true,
  resources: true,
  scalingTracks: true,
  activations: true,
  effects: true,
  supersedes: true,
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
export const FeatureLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateFeatureDto = z.infer<typeof UpdateFeatureSchema>;
export type FeatureLifecycleCommandDto = z.infer<typeof FeatureLifecycleCommandSchema>;
