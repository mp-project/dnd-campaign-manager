import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import {
  ASSET_MEDIA_ROLES,
  ASSET_MEDIA_VISIBILITIES,
  MEDIA_SCOPES,
  MEDIA_STATUSES,
  MEDIA_UPLOAD_STATUSES,
} from "#src/modules/media/domain/entities/MediaTable";

/**
 * All fields of a file with their validation rules. The storage key is left out on purpose: it
 * never leaves the server.
 */
export const MediaFileBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto.nullable(),
  scope: z.enum(MEDIA_SCOPES),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  status: z.enum(MEDIA_STATUSES),
  uploadedBy: uuidDto,
  title: z.string().trim().min(1).max(160).nullable(),
  altText: z.string().trim().min(1).max(500).nullable(),
});

/** A running upload; the handle of the storage and the key stay on the server. */
export const MediaUploadBaseSchema = MediaFileBaseSchema.pick({
  id: true,
  originalName: true,
  mimeType: true,
  title: true,
  altText: true,
}).extend({
  sizeBytes: z.number().int().positive(),
  partSizeBytes: z.number().int().positive(),
  partCount: z.number().int().positive(),
  status: z.enum(MEDIA_UPLOAD_STATUSES),
  expiresAt: isoDateTimeDto,
  uploadedParts: z.array(z.number().int().positive()),
});

/** All fields of an assignment; request and response DTOs derive from it via `pick`. */
export const AssetMediaBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  assetId: uuidDto,
  mediaId: uuidDto,
  role: z.enum(ASSET_MEDIA_ROLES),
  title: MediaFileBaseSchema.shape.title,
  caption: z.string().trim().min(1).max(5000).nullable(),
  altText: MediaFileBaseSchema.shape.altText,
  visibility: z.enum(ASSET_MEDIA_VISIBILITIES),
  isPrimary: z.boolean(),
  displayOrder: z.number().int().min(0).max(1_000_000),
});

export type AssetMediaBaseDto = z.infer<typeof AssetMediaBaseSchema>;
