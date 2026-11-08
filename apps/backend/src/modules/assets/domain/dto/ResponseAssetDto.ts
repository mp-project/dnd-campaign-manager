import { z } from "zod";

import type { ContentView } from "#core/content/viewer";
import { baseEntityResponseDto, standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { AssetBaseSchema } from "#src/modules/assets/domain/dto/BaseAssetDto";
import type {
  AssetPage,
  AssetRecord,
} from "#src/modules/assets/domain/repository/AssetsRepository";

/**
 * Full metadata view for admins and campaign editors (GM).
 */
export const ResponseAssetFullSchema = baseEntityResponseDto
  .extend(AssetBaseSchema.omit({ id: true }).shape)
  .extend({ view: z.literal("FULL") });

/**
 * `merged` lists fields whose newer value from somebody else was kept instead of the sent one.
 */
export const ResponseUpdateAssetSchema = ResponseAssetFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * Reduced view for players; contains no lifecycle, audit or GM-only metadata.
 */
export const ResponseAssetPlayerSchema = AssetBaseSchema.pick({
  id: true,
  assetType: true,
  title: true,
  summary: true,
  scope: true,
}).extend({ view: z.literal("PLAYER") });

export const ResponseAssetSchema = z.discriminatedUnion("view", [
  ResponseAssetFullSchema,
  ResponseAssetPlayerSchema,
]);

export const ResponseAssetListSchema = standardListResponseDto(ResponseAssetSchema);

export type ResponseAssetFullDto = z.infer<typeof ResponseAssetFullSchema>;
export type ResponseUpdateAssetDto = z.infer<typeof ResponseUpdateAssetSchema>;
export type ResponseAssetPlayerDto = z.infer<typeof ResponseAssetPlayerSchema>;
export type ResponseAssetDto = z.infer<typeof ResponseAssetSchema>;
export type ResponseAssetListDto = z.infer<typeof ResponseAssetListSchema>;

export function toAssetFullResponse({ asset, rulesetIds }: AssetRecord): ResponseAssetFullDto {
  return {
    view: "FULL",
    id: asset.id,
    version: asset.version,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    deletedAt: asset.deletedAt?.toISOString() ?? null,
    createdBy: asset.createdBy,
    updatedBy: asset.updatedBy,
    assetType: asset.assetType,
    title: asset.title,
    slug: asset.slug,
    summary: asset.summary,
    status: asset.status,
    scope: asset.scope,
    origin: asset.origin,
    campaignId: asset.campaignId,
    assetFamilyId: asset.assetFamilyId,
    rulesetPolicy: asset.rulesetPolicy,
    rulesetIds,
    sourceReference: (asset.sourceReference ?? null) as Record<string, unknown> | null,
    releasedToPlayers: asset.releasedToPlayers,
  };
}

export function toUpdateAssetResponse(
  record: AssetRecord & { merged: string[] },
): ResponseUpdateAssetDto {
  return { ...toAssetFullResponse(record), merged: record.merged };
}

export function toAssetPlayerResponse({ asset }: AssetRecord): ResponseAssetPlayerDto {
  return {
    view: "PLAYER",
    id: asset.id,
    assetType: asset.assetType,
    title: asset.title,
    summary: asset.summary,
    scope: asset.scope,
  };
}

export function toAssetResponse(record: AssetRecord, view: ContentView): ResponseAssetDto {
  return view === "FULL" ? toAssetFullResponse(record) : toAssetPlayerResponse(record);
}

export function toAssetListResponse(params: {
  page: AssetPage;
  view: ContentView;
  limit: number;
  total?: number;
}): ResponseAssetListDto {
  const lastItem = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.page.items.map((record) => toAssetResponse(record, params.view)),
    limit: params.limit,
    nextCursor:
      params.page.hasMore && lastItem
        ? encodePaginationCursor({ sortValue: lastItem.asset.title, id: lastItem.asset.id })
        : null,
    ...(params.total === undefined ? {} : { total: params.total }),
  });
}
