import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { BackgroundBaseSchema } from "#src/modules/backgrounds/domain/dto/BaseBackgroundDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and rulesets. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Each sent part replaces the stored one as a whole.
 * The definition parts count as one unit in conflict checks: a change by somebody else to any of
 * them makes a change to any other a conflict (412), so the definition is never a mix of two
 * versions.
 */
export const UpdateBackgroundSchema = BackgroundBaseSchema.pick({
  name: true,
  summary: true,
  code: true,
  description: true,
  customizationMode: true,
  displayOrder: true,
  sourceReference: true,
  rulesetPolicy: true,
  rulesetIds: true,
  assetFamilyId: true,
  releasedToPlayers: true,
  sections: true,
  abilityRule: true,
  proficiencyGrants: true,
  featGrants: true,
  featureGrants: true,
  equipmentOptions: true,
  promptTables: true,
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
export const BackgroundLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateBackgroundDto = z.infer<typeof UpdateBackgroundSchema>;
export type BackgroundLifecycleCommandDto = z.infer<typeof BackgroundLifecycleCommandSchema>;
