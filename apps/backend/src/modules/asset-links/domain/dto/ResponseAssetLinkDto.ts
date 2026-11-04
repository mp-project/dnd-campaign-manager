import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto, uuidDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { AssetLinkBaseSchema } from "#src/modules/asset-links/domain/dto/BaseAssetLinkDto";
import {
  ASSET_LINK_DIRECTIONS,
  type AssetLinkDirection,
} from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import type { AssetLinkRow } from "#src/modules/asset-links/domain/repository/AssetLinksRepository";
import { AssetBaseSchema, type AssetRow } from "#src/modules/assets/index";

const AssetLinkDirectionSchema = z.enum(ASSET_LINK_DIRECTIONS);

const RelatedAssetGmSchema = AssetBaseSchema.pick({
  id: true,
  assetType: true,
  title: true,
  status: true,
  scope: true,
});

const RelatedAssetPlayerSchema = RelatedAssetGmSchema.omit({ status: true });

/**
 * Full view for people who may change links. `relatedAsset` is the other end of the link, so the
 * content itself is never copied into the link.
 */
export const ResponseAssetLinkGmSchema = baseEntityResponseDto
  .extend(AssetLinkBaseSchema.omit({ id: true }).shape)
  .extend({
    view: z.literal("GM"),
    direction: AssetLinkDirectionSchema,
    relatedAsset: RelatedAssetGmSchema,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateAssetLinkSchema = ResponseAssetLinkGmSchema.extend({
  merged: z.array(z.string()),
});

/** Reduced view for players; contains no metadata, status or audit data. */
export const ResponseAssetLinkPlayerSchema = AssetLinkBaseSchema.pick({
  id: true,
  sourceAssetId: true,
  targetAssetId: true,
  relationType: true,
  label: true,
}).extend({
  view: z.literal("PLAYER"),
  direction: AssetLinkDirectionSchema,
  relatedAsset: RelatedAssetPlayerSchema,
});

export const ResponseAssetLinkSchema = z.discriminatedUnion("view", [
  ResponseAssetLinkGmSchema,
  ResponseAssetLinkPlayerSchema,
]);

export const ResponseAssetLinkListSchema = standardListResponseDto(ResponseAssetLinkSchema);

export const AssetUsageItemSchema = z.strictObject({
  id: z.string().min(1),
  type: z.string().min(1),
  label: z.string().nullable(),
  assetId: uuidDto.nullable(),
  assetType: AssetBaseSchema.shape.assetType.nullable(),
  /** Route of the module that owns this content; null when the viewer cannot edit it there. */
  editRoute: z.string().nullable(),
});

export const ResponseAssetUsagesSchema = z.strictObject({
  assetId: uuidDto,
  view: z.enum(["GM", "PLAYER"]),
  incoming: z.array(AssetUsageItemSchema),
  outgoing: z.array(AssetUsageItemSchema),
  outlinePlacements: z.array(AssetUsageItemSchema),
  shares: z.array(AssetUsageItemSchema),
  typedUsages: z.array(AssetUsageItemSchema),
  /** Providers that failed; the answer is incomplete for their groups. */
  unavailableProviders: z.array(z.string()),
});

export type ResponseAssetLinkGmDto = z.infer<typeof ResponseAssetLinkGmSchema>;
export type ResponseUpdateAssetLinkDto = z.infer<typeof ResponseUpdateAssetLinkSchema>;
export type ResponseAssetLinkPlayerDto = z.infer<typeof ResponseAssetLinkPlayerSchema>;
export type ResponseAssetLinkDto = z.infer<typeof ResponseAssetLinkSchema>;
export type ResponseAssetLinkListDto = z.infer<typeof ResponseAssetLinkListSchema>;
export type AssetUsageItemDto = z.infer<typeof AssetUsageItemSchema>;
export type ResponseAssetUsagesDto = z.infer<typeof ResponseAssetUsagesSchema>;

export function toAssetLinkDirection(link: AssetLinkRow, assetId: string): AssetLinkDirection {
  return link.sourceAssetId === assetId ? "outgoing" : "incoming";
}

export function toAssetLinkGmResponse(
  link: AssetLinkRow,
  direction: AssetLinkDirection,
  related: AssetRow,
): ResponseAssetLinkGmDto {
  return {
    view: "GM",
    id: link.id,
    version: link.version,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
    deletedAt: link.deletedAt?.toISOString() ?? null,
    createdBy: link.createdBy,
    updatedBy: link.updatedBy,
    campaignId: link.campaignId,
    sourceAssetId: link.sourceAssetId,
    targetAssetId: link.targetAssetId,
    relationType: link.relationType,
    label: link.label,
    sortOrder: link.sortOrder,
    metadata: link.metadata as Record<string, unknown>,
    direction,
    relatedAsset: {
      id: related.id,
      assetType: related.assetType,
      title: related.title,
      status: related.status,
      scope: related.scope,
    },
  };
}

export function toUpdateAssetLinkResponse(
  link: AssetLinkRow,
  related: AssetRow,
  merged: string[],
): ResponseUpdateAssetLinkDto {
  return { ...toAssetLinkGmResponse(link, "outgoing", related), merged };
}

export function toAssetLinkPlayerResponse(
  link: AssetLinkRow,
  direction: AssetLinkDirection,
  related: AssetRow,
): ResponseAssetLinkPlayerDto {
  return {
    view: "PLAYER",
    id: link.id,
    sourceAssetId: link.sourceAssetId,
    targetAssetId: link.targetAssetId,
    relationType: link.relationType,
    label: link.label,
    direction,
    relatedAsset: {
      id: related.id,
      assetType: related.assetType,
      title: related.title,
      scope: related.scope,
    },
  };
}

export function toAssetLinkListResponse(params: {
  data: ResponseAssetLinkDto[];
  lastLink: AssetLinkRow | undefined;
  hasMore: boolean;
  limit: number;
}): ResponseAssetLinkListDto {
  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.hasMore && params.lastLink
        ? encodePaginationCursor({ sortValue: params.lastLink.sortOrder, id: params.lastLink.id })
        : null,
  });
}
