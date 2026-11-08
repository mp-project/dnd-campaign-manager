import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { TagBaseSchema } from "#src/modules/tags/domain/dto/BaseTagDto";
import type { TagPage, TagRow } from "#src/modules/tags/domain/repository/TagsRepository";

export const ResponseTagFullSchema = baseEntityResponseDto
  .extend(
    TagBaseSchema.pick({
      campaignId: true,
      name: true,
      color: true,
      description: true,
      sortOrder: true,
    }).shape,
  )
  .extend({
    view: z.literal("FULL"),
    /** Assets with this tag, including archived ones. */
    usageCount: z.number().int().nonnegative(),
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateTagSchema = ResponseTagFullSchema.extend({
  merged: z.array(z.string()),
});

/** Reduced view for players; contains no description, audit data or usage. */
export const ResponseTagPlayerSchema = TagBaseSchema.pick({
  id: true,
  name: true,
  color: true,
}).extend({ view: z.literal("PLAYER") });

export const ResponseTagListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseTagFullSchema, ResponseTagPlayerSchema]),
);

/** `assetVersion` is what a replacement sends as `expectedVersion`. */
export const ResponseAssetTagsFullSchema = z.strictObject({
  view: z.literal("FULL"),
  assetId: uuidDto,
  assetVersion: z.number().int().positive(),
  tags: z.array(ResponseTagFullSchema),
});

export const ResponseReplaceAssetTagsSchema = ResponseAssetTagsFullSchema.extend({
  merged: z.array(z.string()),
});

export const ResponseAssetTagsPlayerSchema = z.strictObject({
  view: z.literal("PLAYER"),
  assetId: uuidDto,
  tags: z.array(ResponseTagPlayerSchema),
});

export const ResponseAssetTagsSchema = z.discriminatedUnion("view", [
  ResponseAssetTagsFullSchema,
  ResponseAssetTagsPlayerSchema,
]);

export type ResponseTagFullDto = z.infer<typeof ResponseTagFullSchema>;
export type ResponseUpdateTagDto = z.infer<typeof ResponseUpdateTagSchema>;
export type ResponseTagPlayerDto = z.infer<typeof ResponseTagPlayerSchema>;
export type ResponseTagListDto = z.infer<typeof ResponseTagListSchema>;
export type ResponseAssetTagsFullDto = z.infer<typeof ResponseAssetTagsFullSchema>;
export type ResponseReplaceAssetTagsDto = z.infer<typeof ResponseReplaceAssetTagsSchema>;
export type ResponseAssetTagsDto = z.infer<typeof ResponseAssetTagsSchema>;

export function toTagFullResponse(tag: TagRow, usageCount: number): ResponseTagFullDto {
  return {
    view: "FULL",
    id: tag.id,
    version: tag.version,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
    deletedAt: tag.deletedAt?.toISOString() ?? null,
    createdBy: tag.createdBy,
    updatedBy: tag.updatedBy,
    campaignId: tag.campaignId,
    name: tag.name,
    color: tag.color,
    description: tag.description,
    sortOrder: tag.sortOrder,
    usageCount,
  };
}

export function toTagPlayerResponse(tag: TagRow): ResponseTagPlayerDto {
  return { view: "PLAYER", id: tag.id, name: tag.name, color: tag.color };
}

export function toTagListResponse(params: {
  page: TagPage;
  data: ResponseTagListDto["data"];
  limit: number;
}): ResponseTagListDto {
  const lastTag = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && lastTag
        ? encodePaginationCursor({ sortValue: lastTag.sortOrder, id: lastTag.id })
        : null,
  });
}
