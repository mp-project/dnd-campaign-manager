import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import {
  AssetBaseSchema,
  AssetEditableStatusSchema,
} from "#src/modules/assets/domain/dto/BaseAssetDto";

export const UpdateAssetMetadataSchema = AssetBaseSchema.pick({
  title: true,
  slug: true,
  summary: true,
  assetFamilyId: true,
  rulesetPolicy: true,
  rulesetIds: true,
  sourceReference: true,
})
  .extend({ status: AssetEditableStatusSchema })
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

export const AssetLifecycleCommandSchema = expectedVersionDto;

export type UpdateAssetMetadataDto = z.infer<typeof UpdateAssetMetadataSchema>;
export type AssetLifecycleCommandDto = z.infer<typeof AssetLifecycleCommandSchema>;
