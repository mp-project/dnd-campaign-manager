import { z } from "zod";

import { booleanQueryDto, paginationDto, uuidDto } from "#core/http/dto";

export const RequestTagsParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestTagItemParamsSchema = RequestTagsParamsSchema.extend({
  tagId: uuidDto,
});

export const RequestAssetTagsParamsSchema = RequestTagsParamsSchema.extend({
  assetId: uuidDto,
});

export const RequestTagsQuerySchema = paginationDto;

export const RequestDeleteTagQuerySchema = z.strictObject({
  /** Removes the tag from all assets first; otherwise a tag in use is refused. */
  forceDetach: booleanQueryDto.default(false),
});

export type RequestTagsQueryDto = z.infer<typeof RequestTagsQuerySchema>;
