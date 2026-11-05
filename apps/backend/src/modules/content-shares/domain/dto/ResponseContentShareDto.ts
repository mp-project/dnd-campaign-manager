import { z } from "zod";

import { isoDateTimeDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { AssetBaseSchema, type AssetRow } from "#src/modules/assets/index";
import { ContentShareBaseSchema } from "#src/modules/content-shares/domain/dto/BaseContentShareDto";
import type { ContentShareRow } from "#src/modules/content-shares/domain/repository/ContentSharesRepository";

const SharedAssetGmSchema = AssetBaseSchema.pick({
  id: true,
  assetType: true,
  title: true,
  status: true,
});

const SharedAssetPlayerSchema = SharedAssetGmSchema.omit({ status: true });

/** Full view for people who manage shares. Only active players are listed as recipients. */
export const ResponseContentShareGmSchema = ContentShareBaseSchema.extend({
  view: z.literal("GM"),
  version: z.number().int().positive(),
  createdAt: isoDateTimeDto,
  updatedAt: isoDateTimeDto,
  createdBy: uuidDto,
  updatedBy: uuidDto.nullable(),
  asset: SharedAssetGmSchema,
});

/**
 * What a player learns: the content and since when they see it, nothing about other recipients.
 * What the content shows is up to the module that owns it.
 */
export const ResponseContentSharePlayerSchema = ContentShareBaseSchema.pick({
  id: true,
  assetId: true,
  expiresAt: true,
}).extend({
  view: z.literal("PLAYER"),
  revealedAt: isoDateTimeDto,
  asset: SharedAssetPlayerSchema,
});

export const ResponseContentShareSchema = z.discriminatedUnion("view", [
  ResponseContentShareGmSchema,
  ResponseContentSharePlayerSchema,
]);

/**
 * The shared content itself. `content` is the player response of the module that owns
 * `assetType`, so the client picks its view by the type.
 */
export const ResponseSharedContentSchema = z.strictObject({
  shareId: uuidDto,
  assetId: uuidDto,
  assetType: AssetBaseSchema.shape.assetType,
  title: AssetBaseSchema.shape.title,
  content: z.unknown(),
});

export type ResponseSharedContentDto = z.infer<typeof ResponseSharedContentSchema>;

export const ResponseContentShareListSchema = standardListResponseDto(ResponseContentShareSchema);

export type ResponseContentShareGmDto = z.infer<typeof ResponseContentShareGmSchema>;
export type ResponseContentSharePlayerDto = z.infer<typeof ResponseContentSharePlayerSchema>;
export type ResponseContentShareDto = z.infer<typeof ResponseContentShareSchema>;
export type ResponseContentShareListDto = z.infer<typeof ResponseContentShareListSchema>;

export function toContentShareGmResponse(
  share: ContentShareRow,
  recipientMemberIds: readonly string[],
  asset: AssetRow,
): ResponseContentShareGmDto {
  return {
    view: "GM",
    id: share.id,
    version: share.version,
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    createdBy: share.createdBy,
    updatedBy: share.updatedBy,
    campaignId: share.campaignId,
    assetId: share.assetId,
    audience: share.audience,
    recipientMemberIds: [...recipientMemberIds],
    sharedAt: share.sharedAt.toISOString(),
    expiresAt: share.expiresAt?.toISOString() ?? null,
    asset: { id: asset.id, assetType: asset.assetType, title: asset.title, status: asset.status },
  };
}

export function toContentSharePlayerResponse(
  share: ContentShareRow,
  revealedAt: Date,
  asset: AssetRow,
): ResponseContentSharePlayerDto {
  return {
    view: "PLAYER",
    id: share.id,
    assetId: share.assetId,
    expiresAt: share.expiresAt?.toISOString() ?? null,
    revealedAt: revealedAt.toISOString(),
    asset: { id: asset.id, assetType: asset.assetType, title: asset.title },
  };
}

export function toSharedContentResponse(
  share: ContentShareRow,
  asset: AssetRow,
  content: unknown,
): ResponseSharedContentDto {
  return {
    shareId: share.id,
    assetId: asset.id,
    assetType: asset.assetType,
    title: asset.title,
    content,
  };
}

/** Both lists are sorted newest first; the cursor holds the time the viewer sorts by. */
export function toContentShareListResponse(params: {
  data: ResponseContentShareDto[];
  last: { sortValue: Date; id: string } | undefined;
  hasMore: boolean;
  limit: number;
}): ResponseContentShareListDto {
  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor: params.hasMore && params.last ? encodePaginationCursor(params.last) : null,
  });
}
