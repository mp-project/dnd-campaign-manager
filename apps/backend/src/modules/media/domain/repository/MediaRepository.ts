import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { campaigns } from "#src/modules/campaigns/domain/entities/CampaignsTable";
import {
  assetMedia,
  mediaFiles,
  mediaUploads,
  mediaVariants,
} from "#src/modules/media/domain/entities/MediaTable";

export type MediaFileRow = typeof mediaFiles.$inferSelect;
export type AssetMediaRow = typeof assetMedia.$inferSelect;
export type MediaUploadRow = typeof mediaUploads.$inferSelect;
export type MediaVariantRow = typeof mediaVariants.$inferSelect;
export type CampaignOwner = { ownerUserId: string };
export type AssetMediaWithFile = { assignment: AssetMediaRow; file: MediaFileRow };

export type MediaFilePage = {
  items: MediaFileRow[];
  hasMore: boolean;
};

const WITH_ASSET = "WITH_ASSET";

/**
 * Assignments only change through the history. Files are written directly: nobody can edit them, so
 * there is nothing to restore, and their status only records the course of the upload.
 */
export class MediaRepository {
  async findFileById(db: AppDatabase, mediaId: string): Promise<MediaFileRow | null> {
    const [row] = await db
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), isNull(mediaFiles.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /** Blocks attaching until the deletion is done, so counting afterwards misses nothing. */
  async lockFileForDelete(db: AppDatabase, mediaId: string): Promise<MediaFileRow | null> {
    const [row] = await db
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), isNull(mediaFiles.deletedAt)))
      .for("update");

    return row ?? null;
  }

  /** Keeps the file from being deleted until the transaction ends. */
  async lockFileForUse(db: AppDatabase, mediaId: string): Promise<MediaFileRow | null> {
    const [row] = await db
      .select()
      .from(mediaFiles)
      .where(and(eq(mediaFiles.id, mediaId), isNull(mediaFiles.deletedAt)))
      .for("share");

    return row ?? null;
  }

  async createFile(db: AppDatabase, values: typeof mediaFiles.$inferInsert): Promise<void> {
    await db.insert(mediaFiles).values(values);
  }

  async updateFileStatus(
    db: AppDatabase,
    mediaId: string,
    status: MediaFileRow["status"],
  ): Promise<MediaFileRow | null> {
    const [row] = await db
      .update(mediaFiles)
      .set({ status, updatedAt: new Date() })
      .where(eq(mediaFiles.id, mediaId))
      .returning();

    return row ?? null;
  }

  async deleteFile(db: AppDatabase, mediaId: string, actorId: string): Promise<void> {
    const now = new Date();

    await db
      .update(mediaFiles)
      .set({ deletedAt: now, updatedAt: now, updatedBy: actorId })
      .where(eq(mediaFiles.id, mediaId));
  }

  async updateFileObjectDeleted(db: AppDatabase, mediaId: string): Promise<void> {
    await db
      .update(mediaFiles)
      .set({ objectDeletedAt: new Date() })
      .where(eq(mediaFiles.id, mediaId));
  }

  /** With `onAssetIds`: only ready files that players see on one of these assets. */
  async listFilesPage(
    db: AppDatabase,
    filter: {
      campaignId: string;
      limit: number;
      cursor?: string | undefined;
      onAssetIds?: readonly string[] | undefined;
    },
  ): Promise<MediaFilePage> {
    if (filter.onAssetIds?.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await db
      .select()
      .from(mediaFiles)
      .where(
        and(
          isNull(mediaFiles.deletedAt),
          filter.onAssetIds
            ? and(eq(mediaFiles.status, "READY"), this.playerSeesOn(filter.onAssetIds))
            : eq(mediaFiles.campaignId, filter.campaignId),
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(mediaFiles.originalName), asc(mediaFiles.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async countAssignments(
    db: AppDatabase,
    mediaIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (mediaIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ mediaId: assetMedia.mediaId, total: sql<number>`count(*)::int` })
      .from(assetMedia)
      .where(and(inArray(assetMedia.mediaId, [...mediaIds]), isNull(assetMedia.deletedAt)))
      .groupBy(assetMedia.mediaId);

    return new Map(rows.map((row) => [row.mediaId, row.total]));
  }

  /** Assets of the campaign where players may get this file. */
  async listPlayerAssetIdsOfFile(
    db: AppDatabase,
    params: { campaignId: string; mediaId: string },
  ): Promise<string[]> {
    const rows = await db
      .select({ assetId: assetMedia.assetId })
      .from(assetMedia)
      .where(
        and(
          eq(assetMedia.campaignId, params.campaignId),
          eq(assetMedia.mediaId, params.mediaId),
          eq(assetMedia.visibility, WITH_ASSET),
          isNull(assetMedia.deletedAt),
        ),
      );

    return rows.map((row) => row.assetId);
  }

  async findAssignmentById(db: AppDatabase, assignmentId: string): Promise<AssetMediaRow | null> {
    const [row] = await db
      .select()
      .from(assetMedia)
      .where(and(eq(assetMedia.id, assignmentId), isNull(assetMedia.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findPrimaryAssignment(
    db: AppDatabase,
    params: { assetId: string; role: AssetMediaRow["role"]; exceptId?: string },
  ): Promise<AssetMediaRow | null> {
    const [row] = await db
      .select()
      .from(assetMedia)
      .where(
        and(
          eq(assetMedia.assetId, params.assetId),
          eq(assetMedia.role, params.role),
          eq(assetMedia.isPrimary, true),
          isNull(assetMedia.deletedAt),
          params.exceptId ? ne(assetMedia.id, params.exceptId) : undefined,
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async listAssignmentsOfAsset(db: AppDatabase, assetId: string): Promise<AssetMediaWithFile[]> {
    return db
      .select({ assignment: assetMedia, file: mediaFiles })
      .from(assetMedia)
      .innerJoin(mediaFiles, eq(mediaFiles.id, assetMedia.mediaId))
      .where(
        and(
          eq(assetMedia.assetId, assetId),
          isNull(assetMedia.deletedAt),
          isNull(mediaFiles.deletedAt),
        ),
      )
      .orderBy(asc(assetMedia.role), asc(assetMedia.displayOrder), asc(assetMedia.id));
  }

  // ---------------------------------------------------------------------------
  // Limits
  // ---------------------------------------------------------------------------

  async findCampaignOwner(db: AppDatabase, campaignId: string): Promise<CampaignOwner | null> {
    const [row] = await this.selectCampaignOwner(db, campaignId);

    return row ?? null;
  }

  /** Makes uploads to the same campaign wait, so several can't use the same free space. */
  async lockCampaignWithOwner(db: AppDatabase, campaignId: string): Promise<CampaignOwner | null> {
    const [row] = await this.selectCampaignOwner(db, campaignId).for("no key update");

    return row ?? null;
  }

  /** Files and running uploads of the campaign. */
  async sumCampaignUsage(db: AppDatabase, campaignId: string, now: Date): Promise<number> {
    const [files] = await db
      .select({ total: sql<string>`coalesce(sum(${mediaFiles.sizeBytes}), 0)::text` })
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.campaignId, campaignId),
          isNull(mediaFiles.deletedAt),
          ne(mediaFiles.status, "FAILED"),
        ),
      );
    const [uploads] = await db
      .select({ total: sql<string>`coalesce(sum(${mediaUploads.sizeBytes}), 0)::text` })
      .from(mediaUploads)
      .where(and(eq(mediaUploads.campaignId, campaignId), gt(mediaUploads.expiresAt, now)));

    return Number(files?.total ?? 0) + Number(uploads?.total ?? 0);
  }

  private selectCampaignOwner(db: AppDatabase, campaignId: string) {
    return db
      .select({ ownerUserId: campaigns.ownerUserId })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
  }

  // ---------------------------------------------------------------------------
  // Uploads
  // ---------------------------------------------------------------------------

  async createUpload(db: AppDatabase, values: typeof mediaUploads.$inferInsert): Promise<MediaUploadRow> {
    const [row] = await db.insert(mediaUploads).values(values).returning();

    return row!;
  }

  async findUploadById(db: AppDatabase, uploadId: string): Promise<MediaUploadRow | null> {
    const [row] = await db
      .select()
      .from(mediaUploads)
      .where(eq(mediaUploads.id, uploadId))
      .limit(1);

    return row ?? null;
  }

  /** Only one request can finish an upload; returns null for all others. */
  async updateUploadToCompleting(
    db: AppDatabase,
    uploadId: string,
    now: Date,
  ): Promise<MediaUploadRow | null> {
    const [row] = await db
      .update(mediaUploads)
      .set({ status: "COMPLETING", updatedAt: now })
      .where(
        and(
          eq(mediaUploads.id, uploadId),
          eq(mediaUploads.status, "ACTIVE"),
          gt(mediaUploads.expiresAt, now),
        ),
      )
      .returning();

    return row ?? null;
  }

  async updateUploadToActive(db: AppDatabase, uploadId: string): Promise<void> {
    await db
      .update(mediaUploads)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(eq(mediaUploads.id, uploadId));
  }

  async deleteUpload(db: AppDatabase, uploadId: string): Promise<void> {
    await db.delete(mediaUploads).where(eq(mediaUploads.id, uploadId));
  }

  async listExpiredUploads(db: AppDatabase, now: Date, limit: number): Promise<MediaUploadRow[]> {
    return db.select().from(mediaUploads).where(lt(mediaUploads.expiresAt, now)).limit(limit);
  }

  // ---------------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------------

  async createVariants(db: AppDatabase, values: (typeof mediaVariants.$inferInsert)[]): Promise<void> {
    if (values.length > 0) {
      await db.insert(mediaVariants).values(values);
    }
  }

  async findReadyVariant(
    db: AppDatabase,
    mediaId: string,
    kind: MediaVariantRow["kind"],
  ): Promise<MediaVariantRow | null> {
    const [row] = await db
      .select()
      .from(mediaVariants)
      .where(
        and(
          eq(mediaVariants.mediaId, mediaId),
          eq(mediaVariants.kind, kind),
          eq(mediaVariants.status, "READY"),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async listVariantsOfFile(db: AppDatabase, mediaId: string): Promise<MediaVariantRow[]> {
    return db.select().from(mediaVariants).where(eq(mediaVariants.mediaId, mediaId));
  }

  /**
   * Claims the open variants of one file, so the worker reads the original only once. Jobs of a
   * crashed worker become available again after `staleBefore`, until they used up their attempts.
   */
  async claimNextVariants(
    db: AppDatabase,
    params: { now: Date; staleBefore: Date; maxAttempts: number },
  ): Promise<MediaVariantRow[]> {
    const claimable = and(
      lt(mediaVariants.attempts, params.maxAttempts),
      or(
        eq(mediaVariants.status, "PENDING"),
        and(eq(mediaVariants.status, "PROCESSING"), lt(mediaVariants.lockedAt, params.staleBefore)),
      ),
    );
    const [next] = await db
      .select({ mediaId: mediaVariants.mediaId })
      .from(mediaVariants)
      .where(claimable)
      .orderBy(asc(mediaVariants.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    if (!next) {
      return [];
    }

    return db
      .update(mediaVariants)
      .set({
        status: "PROCESSING",
        lockedAt: params.now,
        attempts: sql`${mediaVariants.attempts} + 1`,
        updatedAt: params.now,
      })
      .where(and(eq(mediaVariants.mediaId, next.mediaId), claimable))
      .returning();
  }

  async updateVariant(
    db: AppDatabase,
    variantId: string,
    values: Partial<typeof mediaVariants.$inferInsert>,
  ): Promise<void> {
    await db
      .update(mediaVariants)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(mediaVariants.id, variantId));
  }

  async updateVariantsExhausted(
    db: AppDatabase,
    params: { staleBefore: Date; maxAttempts: number },
  ): Promise<void> {
    await db
      .update(mediaVariants)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(
        and(
          eq(mediaVariants.status, "PROCESSING"),
          lt(mediaVariants.lockedAt, params.staleBefore),
          gte(mediaVariants.attempts, params.maxAttempts),
        ),
      );
  }

  async updateFileDimensions(
    db: AppDatabase,
    mediaId: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    await db
      .update(mediaFiles)
      .set({ ...dimensions, updatedAt: new Date() })
      .where(eq(mediaFiles.id, mediaId));
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  async listFilesWithObjectToDelete(db: AppDatabase, limit: number): Promise<MediaFileRow[]> {
    return db
      .select()
      .from(mediaFiles)
      .where(and(isNotNull(mediaFiles.deletedAt), isNull(mediaFiles.objectDeletedAt)))
      .limit(limit);
  }

  async listStalePendingFiles(
    db: AppDatabase,
    olderThan: Date,
    limit: number,
  ): Promise<MediaFileRow[]> {
    return db
      .select()
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.status, "PENDING"),
          lt(mediaFiles.createdAt, olderThan),
          isNull(mediaFiles.deletedAt),
        ),
      )
      .limit(limit);
  }

  /** A failed upload has no use for its object anymore; one being finished still needs it. */
  async isStorageKeyInUse(db: AppDatabase, storageKey: string): Promise<boolean> {
    const [upload] = await db
      .select({ id: mediaUploads.id })
      .from(mediaUploads)
      .where(eq(mediaUploads.storageKey, storageKey))
      .limit(1);

    if (upload) {
      return true;
    }

    const [row] = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.storageKey, storageKey),
          ne(mediaFiles.status, "FAILED"),
          isNull(mediaFiles.objectDeletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async isVariantKeyInUse(db: AppDatabase, storageKey: string): Promise<boolean> {
    const [row] = await db
      .select({ id: mediaVariants.id })
      .from(mediaVariants)
      .innerJoin(mediaFiles, eq(mediaFiles.id, mediaVariants.mediaId))
      .where(and(eq(mediaVariants.storageKey, storageKey), isNull(mediaFiles.deletedAt)))
      .limit(1);

    return row !== undefined;
  }

  private playerSeesOn(assetIds: readonly string[]): SQL {
    return sql`exists (select 1 from ${assetMedia} where ${and(
      eq(assetMedia.mediaId, mediaFiles.id),
      inArray(assetMedia.assetId, [...assetIds]),
      eq(assetMedia.visibility, WITH_ASSET),
      isNull(assetMedia.deletedAt),
    )})`;
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(
      gt(mediaFiles.originalName, value),
      and(eq(mediaFiles.originalName, value), gt(mediaFiles.id, id)),
    );
  }
}
