import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetLinkBaseSchema } from "#src/modules/asset-links/domain/dto/BaseAssetLinkDto";

/**
 * Target and relation cannot change: that is a different link, so delete it and create a new one.
 */
export const UpdateAssetLinkSchema = AssetLinkBaseSchema.pick({
  label: true,
  sortOrder: true,
  metadata: true,
})
  .partial()
  .extend(expectedVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, fieldValue]) => key !== "expectedVersion" && fieldValue !== undefined,
      ),
    {
      message: "At least one field must be provided for patch updates",
    },
  );

export type UpdateAssetLinkDto = z.infer<typeof UpdateAssetLinkSchema>;
