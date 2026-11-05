import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { users } from "../../../users/domain/entities/UsersTable.js";

export const MEDIA_SCOPES = ["SYSTEM", "CAMPAIGN"] as const;
export const MEDIA_STATUSES = ["PENDING", "READY", "FAILED", "QUARANTINED"] as const;
export const ASSET_MEDIA_ROLES = ["COVER", "GALLERY", "DOCUMENT", "MAP", "OTHER"] as const;
export const ASSET_MEDIA_VISIBILITIES = ["GM_ONLY", "WITH_ASSET"] as const;
export const MEDIA_UPLOAD_STATUSES = ["ACTIVE", "COMPLETING"] as const;
export const MEDIA_VARIANT_KINDS = ["THUMBNAIL", "DISPLAY"] as const;
export const MEDIA_VARIANT_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const;

export const mediaScopeEnum = pgEnum("media_scope", MEDIA_SCOPES);
export const mediaStatusEnum = pgEnum("media_status", MEDIA_STATUSES);
export const assetMediaRoleEnum = pgEnum("asset_media_role", ASSET_MEDIA_ROLES);
export const assetMediaVisibilityEnum = pgEnum("asset_media_visibility", ASSET_MEDIA_VISIBILITIES);
export const mediaUploadStatusEnum = pgEnum("media_upload_status", MEDIA_UPLOAD_STATUSES);
export const mediaVariantKindEnum = pgEnum("media_variant_kind", MEDIA_VARIANT_KINDS);
export const mediaVariantStatusEnum = pgEnum("media_variant_status", MEDIA_VARIANT_STATUSES);

/**
 * An uploaded file. The row and the object cannot commit together, so a row starts as `PENDING`, and
 * a deleted row stays until `objectDeletedAt` says the object is gone as well.
 */
export const mediaFiles = pgTable(
  "media_files",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    scope: mediaScopeEnum("scope").notNull(),
    storageKey: text("storage_key").notNull().unique("media_files_storage_key_unique"),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    width: integer("width"),
    height: integer("height"),
    status: mediaStatusEnum("status").notNull().default("PENDING"),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Defaults for assignments that don't set their own. */
    title: varchar("title", { length: 160 }),
    altText: varchar("alt_text", { length: 500 }),
    objectDeletedAt: timestamp("object_deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("media_files_campaign_name_idx").on(table.campaignId, table.originalName, table.id),
    index("media_files_status_idx").on(table.status, table.createdAt),
    index("media_files_quota_idx").on(table.campaignId, table.status).where(sql`${table.deletedAt} is null`),
    check(
      "media_files_scope_campaign_check",
      sql`(${table.scope} = 'SYSTEM' and ${table.campaignId} is null)
        or (${table.scope} = 'CAMPAIGN' and ${table.campaignId} is not null)`,
    ),
    check("media_files_size_check", sql`${table.sizeBytes} >= 0`),
    check("media_files_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "media_files_dimensions_check",
      sql`(${table.width} is null or ${table.width} > 0) and (${table.height} is null or ${table.height} > 0)`,
    ),
  ],
);

/**
 * A running upload in parts. Its id becomes the id of the file. The row reserves the size against the
 * quota until the file exists; `storageUploadId` is the handle of the storage and never leaves the
 * server. A finished or aborted upload has no row anymore.
 */
export const mediaUploads = pgTable(
  "media_uploads",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique("media_uploads_storage_key_unique"),
    storageUploadId: text("storage_upload_id").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    partSizeBytes: integer("part_size_bytes").notNull(),
    status: mediaUploadStatusEnum("status").notNull().default("ACTIVE"),
    title: varchar("title", { length: 160 }),
    altText: varchar("alt_text", { length: 500 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("media_uploads_campaign_idx").on(table.campaignId),
    index("media_uploads_expires_idx").on(table.expiresAt),
    check("media_uploads_size_check", sql`${table.sizeBytes} > 0`),
    check("media_uploads_part_size_check", sql`${table.partSizeBytes} > 0`),
  ],
);

/**
 * A smaller copy of an image, generated by the worker (`media:worker`). The row is also its job. The
 * original stays untouched; while a variant isn't ready, the original is delivered instead.
 */
export const mediaVariants = pgTable(
  "media_variants",
  {
    ...baseColumns(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "restrict" }),
    kind: mediaVariantKindEnum("kind").notNull(),
    status: mediaVariantStatusEnum("status").notNull().default("PENDING"),
    storageKey: text("storage_key").notNull().unique("media_variants_storage_key_unique"),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    attempts: integer("attempts").notNull().default(0),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("media_variants_media_kind_unique_idx").on(table.mediaId, table.kind),
    index("media_variants_status_idx").on(table.status, table.createdAt),
  ],
);

/**
 * A file on an asset. The composite foreign key keeps the asset in the campaign, so global assets
 * have no assignments; the file may be global, so its campaign is checked by the service.
 */
export const assetMedia = pgTable(
  "asset_media",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "restrict" }),
    role: assetMediaRoleEnum("role").notNull(),
    title: varchar("title", { length: 160 }),
    caption: text("caption"),
    altText: varchar("alt_text", { length: 500 }),
    visibility: assetMediaVisibilityEnum("visibility").notNull().default("GM_ONLY"),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    /** Copied from the file, which never changes, so the check below can use it. */
    isImage: boolean("is_image").notNull().default(false),
  },
  (table) => [
    foreignKey({
      name: "asset_media_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex(
      "asset_media_asset_media_role_active_unique_idx",
      [table.assetId, table.mediaId, table.role],
      table.deletedAt,
    ),
    uniqueIndex("asset_media_primary_active_unique_idx")
      .on(table.assetId, table.role)
      .where(sql`${table.deletedAt} is null and ${table.isPrimary} = true`),
    index("asset_media_asset_order_idx").on(table.assetId, table.displayOrder),
    index("asset_media_media_idx").on(table.mediaId),
    check("asset_media_display_order_check", sql`${table.displayOrder} >= 0`),
    check(
      "asset_media_player_image_alt_check",
      sql`${table.visibility} = 'GM_ONLY' or ${table.isImage} = false or ${table.altText} is not null`,
    ),
  ],
);
