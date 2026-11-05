import { z } from "zod";

import { API_BASE_PATH } from "#core/config/constants";
import { baseEntityResponseDto, standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import {
  AssetMediaBaseSchema,
  MediaFileBaseSchema,
  MediaUploadBaseSchema,
} from "#src/modules/media/domain/dto/BaseMediaDto";
import type {
  AssetMediaRow,
  MediaFilePage,
  MediaFileRow,
  MediaUploadRow,
} from "#src/modules/media/domain/repository/MediaRepository";

/** Always goes through the permission check of the content route, so it leaks no storage path. */
const contentUrlDto = z.string().min(1);

const byteCountDto = z.number().int().nonnegative();

/**
 * Comes with every response that lists files or changes the used space, so the frontend needs no
 * extra request. Null unless the viewer is an administrator or the campaign owner, and without S3.
 */
export const ResponseMediaStorageUsageSchema = z
  .strictObject({
    /** This campaign, including running uploads. */
    usedBytes: byteCountDto,
    totalBytes: byteCountDto,
  })
  .nullable();

const storageUsageShape = { storageUsage: ResponseMediaStorageUsageSchema };

export const ResponseMediaUploadSchema = MediaUploadBaseSchema.omit({ title: true, altText: true });

export const ResponseCreateMediaUploadSchema = ResponseMediaUploadSchema.extend(storageUsageShape);

/** For deleting a file and aborting an upload: nothing else is left to report. */
export const ResponseMediaRemovedSchema = z.strictObject(storageUsageShape);

export const ResponseMediaUploadPartSchema = z.strictObject({
  partNumber: z.number().int().positive(),
  sizeBytes: z.number().int().positive(),
});

export const ResponseMediaGmSchema = baseEntityResponseDto
  .extend(MediaFileBaseSchema.omit({ id: true }).shape)
  .extend({
    view: z.literal("GM"),
    contentUrl: contentUrlDto,
    /** Active assignments, also on archived assets. */
    usageCount: z.number().int().nonnegative(),
  });

export const ResponseCompleteMediaUploadSchema = ResponseMediaGmSchema.extend(storageUsageShape);

export const ResponseMediaPlayerSchema = MediaFileBaseSchema.pick({
  id: true,
  mimeType: true,
  width: true,
  height: true,
}).extend({
  view: z.literal("PLAYER"),
  contentUrl: contentUrlDto,
});

export const ResponseMediaSchema = z.discriminatedUnion("view", [
  ResponseMediaGmSchema,
  ResponseMediaPlayerSchema,
]);

export const ResponseMediaListSchema =
  standardListResponseDto(ResponseMediaSchema).extend(storageUsageShape);

export const ResponseAssetMediaGmSchema = baseEntityResponseDto
  .extend(AssetMediaBaseSchema.omit({ id: true }).shape)
  .extend({
    view: z.literal("GM"),
    media: MediaFileBaseSchema.pick({
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      width: true,
      height: true,
    }).extend({ contentUrl: contentUrlDto }),
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateAssetMediaSchema = ResponseAssetMediaGmSchema.extend({
  merged: z.array(z.string()),
});

/** Contains neither visibility nor audit data; a player only ever gets assignments for players. */
export const ResponseAssetMediaPlayerSchema = AssetMediaBaseSchema.pick({
  id: true,
  assetId: true,
  mediaId: true,
  role: true,
  title: true,
  caption: true,
  altText: true,
  isPrimary: true,
  displayOrder: true,
}).extend({
  view: z.literal("PLAYER"),
  media: MediaFileBaseSchema.pick({ mimeType: true, width: true, height: true }).extend({
    contentUrl: contentUrlDto,
  }),
});

export const ResponseAssetMediaListSchema = z.strictObject({
  data: z.array(
    z.discriminatedUnion("view", [ResponseAssetMediaGmSchema, ResponseAssetMediaPlayerSchema]),
  ),
});

export type ResponseMediaStorageUsageDto = z.infer<typeof ResponseMediaStorageUsageSchema>;
export type ResponseMediaUploadDto = z.infer<typeof ResponseMediaUploadSchema>;
export type ResponseCreateMediaUploadDto = z.infer<typeof ResponseCreateMediaUploadSchema>;
export type ResponseCompleteMediaUploadDto = z.infer<typeof ResponseCompleteMediaUploadSchema>;
export type ResponseMediaRemovedDto = z.infer<typeof ResponseMediaRemovedSchema>;
export type ResponseMediaUploadPartDto = z.infer<typeof ResponseMediaUploadPartSchema>;
export type ResponseMediaGmDto = z.infer<typeof ResponseMediaGmSchema>;
export type ResponseMediaPlayerDto = z.infer<typeof ResponseMediaPlayerSchema>;
export type ResponseMediaDto = z.infer<typeof ResponseMediaSchema>;
export type ResponseMediaListDto = z.infer<typeof ResponseMediaListSchema>;
export type ResponseAssetMediaGmDto = z.infer<typeof ResponseAssetMediaGmSchema>;
export type ResponseUpdateAssetMediaDto = z.infer<typeof ResponseUpdateAssetMediaSchema>;
export type ResponseAssetMediaPlayerDto = z.infer<typeof ResponseAssetMediaPlayerSchema>;
export type ResponseAssetMediaListDto = z.infer<typeof ResponseAssetMediaListSchema>;

/** The campaign is the one of the request, because global files are used from every campaign. */
function toContentUrl(campaignId: string, mediaId: string): string {
  return `${API_BASE_PATH}/campaigns/${campaignId}/media/${mediaId}/content`;
}

export function toMediaUploadResponse(
  upload: MediaUploadRow,
  uploadedParts: number[],
): ResponseMediaUploadDto {
  return {
    id: upload.id,
    originalName: upload.originalName,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
    partSizeBytes: upload.partSizeBytes,
    partCount: Math.ceil(upload.sizeBytes / upload.partSizeBytes),
    status: upload.status,
    expiresAt: upload.expiresAt.toISOString(),
    uploadedParts,
  };
}

export function toMediaGmResponse(
  file: MediaFileRow,
  campaignId: string,
  usageCount: number,
): ResponseMediaGmDto {
  return {
    view: "GM",
    id: file.id,
    version: file.version,
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
    deletedAt: file.deletedAt?.toISOString() ?? null,
    createdBy: file.createdBy,
    updatedBy: file.updatedBy,
    campaignId: file.campaignId,
    scope: file.scope,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    sha256: file.sha256,
    width: file.width,
    height: file.height,
    status: file.status,
    uploadedBy: file.uploadedBy,
    title: file.title,
    altText: file.altText,
    contentUrl: toContentUrl(campaignId, file.id),
    usageCount,
  };
}

export function toMediaPlayerResponse(
  file: MediaFileRow,
  campaignId: string,
): ResponseMediaPlayerDto {
  return {
    view: "PLAYER",
    id: file.id,
    mimeType: file.mimeType,
    width: file.width,
    height: file.height,
    contentUrl: toContentUrl(campaignId, file.id),
  };
}

export function toMediaListResponse(params: {
  page: MediaFilePage;
  data: ResponseMediaDto[];
  limit: number;
  storageUsage: ResponseMediaStorageUsageDto;
}): ResponseMediaListDto {
  const last = params.page.items.at(-1);

  return {
    ...createStandardListResponse({
      data: params.data,
      limit: params.limit,
      nextCursor:
        params.page.hasMore && last
          ? encodePaginationCursor({ sortValue: last.originalName, id: last.id })
          : null,
    }),
    storageUsage: params.storageUsage,
  };
}

export function toAssetMediaGmResponse(
  assignment: AssetMediaRow,
  file: MediaFileRow,
): ResponseAssetMediaGmDto {
  return {
    view: "GM",
    id: assignment.id,
    version: assignment.version,
    createdAt: assignment.createdAt.toISOString(),
    updatedAt: assignment.updatedAt.toISOString(),
    deletedAt: assignment.deletedAt?.toISOString() ?? null,
    createdBy: assignment.createdBy,
    updatedBy: assignment.updatedBy,
    campaignId: assignment.campaignId,
    assetId: assignment.assetId,
    mediaId: assignment.mediaId,
    role: assignment.role,
    title: assignment.title,
    caption: assignment.caption,
    altText: assignment.altText,
    visibility: assignment.visibility,
    isPrimary: assignment.isPrimary,
    displayOrder: assignment.displayOrder,
    media: {
      id: file.id,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      contentUrl: toContentUrl(assignment.campaignId, file.id),
    },
  };
}

export function toAssetMediaPlayerResponse(
  assignment: AssetMediaRow,
  file: MediaFileRow,
): ResponseAssetMediaPlayerDto {
  return {
    view: "PLAYER",
    id: assignment.id,
    assetId: assignment.assetId,
    mediaId: assignment.mediaId,
    role: assignment.role,
    title: assignment.title,
    caption: assignment.caption,
    altText: assignment.altText,
    isPrimary: assignment.isPrimary,
    displayOrder: assignment.displayOrder,
    media: {
      mimeType: file.mimeType,
      width: file.width,
      height: file.height,
      contentUrl: toContentUrl(assignment.campaignId, file.id),
    },
  };
}
