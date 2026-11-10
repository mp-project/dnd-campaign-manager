import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and tags. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Fields somebody else changed in the meantime are
 * compared one by one, so only a change of the same field is a conflict (412). Parts are replaced
 * as a whole. The category may change: it only sorts and filters, the data stays.
 */
export const UpdateActorSchema = ActorBaseSchema.omit({
  id: true,
  assetId: true,
  campaignId: true,
  status: true,
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
export const ActorLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateActorDto = z.infer<typeof UpdateActorSchema>;
export type ActorLifecycleCommandDto = z.infer<typeof ActorLifecycleCommandSchema>;
