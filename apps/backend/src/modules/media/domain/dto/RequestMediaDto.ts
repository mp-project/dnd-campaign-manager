import { z } from "zod";

import { expectedVersionDto, paginationDto, uuidDto } from "#core/http/dto";
import {
  AssetMediaBaseSchema,
  MediaFileBaseSchema,
  MediaUploadBaseSchema,
} from "#src/modules/media/domain/dto/BaseMediaDto";

export const RequestMediaParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestMediaItemParamsSchema = RequestMediaParamsSchema.extend({
  mediaId: uuidDto,
});

export const RequestAssetMediaParamsSchema = RequestMediaParamsSchema.extend({
  assetId: uuidDto,
});

export const RequestAssetMediaItemParamsSchema = RequestAssetMediaParamsSchema.extend({
  assignmentId: uuidDto,
});

export const RequestMediaUploadParamsSchema = RequestMediaParamsSchema.extend({
  uploadId: uuidDto,
});

export const RequestMediaUploadPartParamsSchema = RequestMediaUploadParamsSchema.extend({
  partNumber: z.coerce.number().int().positive().max(10_000),
});

export const RequestMediaQuerySchema = paginationDto;

/** Without `variant` the original; a variant not ready yet also delivers the original. */
export const RequestMediaContentQuerySchema = z.strictObject({
  variant: z.enum(["thumbnail", "display"]).optional(),
});

export const CreateMediaUploadSchema = MediaUploadBaseSchema.pick({
  originalName: true,
  mimeType: true,
  sizeBytes: true,
}).extend({
  title: MediaFileBaseSchema.shape.title.unwrap().optional(),
  altText: MediaFileBaseSchema.shape.altText.unwrap().optional(),
});

export const AttachMediaSchema = AssetMediaBaseSchema.pick({
  mediaId: true,
  role: true,
}).extend({
  title: AssetMediaBaseSchema.shape.title.optional(),
  caption: AssetMediaBaseSchema.shape.caption.optional(),
  altText: AssetMediaBaseSchema.shape.altText.optional(),
  visibility: AssetMediaBaseSchema.shape.visibility.default("GM_ONLY"),
  isPrimary: AssetMediaBaseSchema.shape.isPrimary.default(false),
  displayOrder: AssetMediaBaseSchema.shape.displayOrder.default(0),
});

/** The file cannot change: that is a different assignment, so detach and attach instead. */
export const UpdateAssetMediaSchema = AssetMediaBaseSchema.pick({
  role: true,
  title: true,
  caption: true,
  altText: true,
  visibility: true,
  isPrimary: true,
  displayOrder: true,
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

export type RequestMediaQueryDto = z.infer<typeof RequestMediaQuerySchema>;
export type RequestMediaContentQueryDto = z.infer<typeof RequestMediaContentQuerySchema>;
export type CreateMediaUploadDto = z.infer<typeof CreateMediaUploadSchema>;
export type AttachMediaDto = z.infer<typeof AttachMediaSchema>;
export type UpdateAssetMediaDto = z.infer<typeof UpdateAssetMediaSchema>;
