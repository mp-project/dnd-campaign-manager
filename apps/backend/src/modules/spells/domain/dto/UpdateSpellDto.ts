import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { SpellBaseSchema, SpellListBaseSchema } from "#src/modules/spells/domain/dto/BaseSpellDto";

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
 * Both versions come from the last response. Each sent part replaces the stored one as a whole.
 * The definition parts count as one unit in conflict checks: a change by somebody else to any of
 * them makes a change to any other a conflict (412). The rules across fields are checked on the
 * merged state, so a change may need several fields at once (a reaction and its trigger).
 */
export const UpdateSpellSchema = SpellBaseSchema.omit({
  id: true,
  assetId: true,
  campaignId: true,
  scope: true,
  status: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

export const UpdateSpellListSchema = SpellListBaseSchema.omit({
  id: true,
  assetId: true,
  campaignId: true,
  scope: true,
  status: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(atLeastOneField, atLeastOneFieldMessage);

/** Deleting archives the asset and restoring brings it back, so both use the asset version. */
export const SpellLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateSpellDto = z.infer<typeof UpdateSpellSchema>;
export type UpdateSpellListDto = z.infer<typeof UpdateSpellListSchema>;
export type SpellLifecycleCommandDto = z.infer<typeof SpellLifecycleCommandSchema>;
