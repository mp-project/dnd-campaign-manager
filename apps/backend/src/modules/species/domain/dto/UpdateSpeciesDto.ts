import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import {
  SpeciesBaseSchema,
  SpeciesVariantBaseSchema,
} from "#src/modules/species/domain/dto/BaseSpeciesDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

const atLeastOneField = (value: Record<string, unknown>) =>
  Object.entries(value).some(
    ([key, fieldValue]) =>
      key !== "expectedVersion" && key !== "expectedAssetVersion" && fieldValue !== undefined,
  );

const atLeastOneFieldMessage = { message: "At least one field must be provided for patch updates" };

/**
 * Both versions come from the last response. Each sent part replaces the stored one as a whole; the
 * rules across parts are checked on the merged state.
 */
export const UpdateSpeciesSchema = SpeciesBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  creatureType: true,
  lifespanMode: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  sizeOptions: true,
  movementModes: true,
  ageProfile: true,
  physicalProfile: true,
  textSections: true,
  variantGroups: true,
  featureGrants: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

/** A variant keeps its species; it may move to another group of it. */
export const UpdateSpeciesVariantSchema = SpeciesVariantBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  variantGroupCode: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  featureGrants: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

/** Deleting archives the asset and restoring brings it back, so both use the asset version. */
export const SpeciesLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateSpeciesDto = z.infer<typeof UpdateSpeciesSchema>;
export type UpdateSpeciesVariantDto = z.infer<typeof UpdateSpeciesVariantSchema>;
export type SpeciesLifecycleCommandDto = z.infer<typeof SpeciesLifecycleCommandSchema>;
