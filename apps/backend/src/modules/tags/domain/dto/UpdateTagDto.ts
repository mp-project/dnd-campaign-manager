import { z } from "zod";

import { expectedVersionDto, uuidDto } from "#core/http/dto";
import { TagBaseSchema } from "#src/modules/tags/domain/dto/BaseTagDto";

export const UpdateTagSchema = TagBaseSchema.pick({
  name: true,
  color: true,
  description: true,
  sortOrder: true,
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

/** `expectedVersion` is the version of the asset, because the assignments are part of it. */
export const ReplaceAssetTagsSchema = expectedVersionDto.extend({
  tagIds: z
    .array(uuidDto)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Tag ids must be unique",
    }),
});

export type UpdateTagDto = z.infer<typeof UpdateTagSchema>;
export type ReplaceAssetTagsDto = z.infer<typeof ReplaceAssetTagsSchema>;
