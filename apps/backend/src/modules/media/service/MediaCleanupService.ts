import type { FastifyBaseLogger } from "fastify";

import type { AppDatabase } from "#core/db/pool";
import { cleanupOrphanedObjects, type StoragePort } from "#core/storage/index";
import type {
  MediaFileRow,
  MediaRepository,
  MediaUploadRow,
} from "#src/modules/media/domain/repository/MediaRepository";

const BATCH_SIZE = 200;
/** Uploads still running must not be cleaned up; a longer one is treated as abandoned. */
const STALE_AFTER_MS = 60 * 60 * 1000;

export type MediaCleanupResult = {
  objectsOfDeletedFiles: number;
  staleUploads: number;
  expiredUploads: number;
  orphanedObjects: number;
};

/**
 * Database and storage cannot commit together, so this repairs what an interrupted process leaves
 * behind. Safe to run repeatedly; it needs a schedule (`npm run media:cleanup`).
 */
export class MediaCleanupService {
  constructor(
    private readonly db: AppDatabase,
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
    private readonly logger: Pick<FastifyBaseLogger, "error">,
  ) {}

  /** Runs after a deletion was committed; on failure the cleanup tries again later. */
  async deleteObject(file: Pick<MediaFileRow, "id" | "storageKey">): Promise<boolean> {
    try {
      const variants = await this.repository.listVariantsOfFile(this.db, file.id);

      await Promise.all(variants.map((variant) => this.storage.delete(variant.storageKey)));
      await this.storage.delete(file.storageKey);
      await this.repository.updateFileObjectDeleted(this.db, file.id);

      return true;
    } catch (error) {
      this.logger.error({ error, mediaId: file.id }, "Could not delete the object of a media file");

      return false;
    }
  }

  async run(now: Date = new Date()): Promise<MediaCleanupResult> {
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
    const deleted = await this.repository.listFilesWithObjectToDelete(this.db, BATCH_SIZE);
    const results = await Promise.all(deleted.map((file) => this.deleteObject(file)));
    const stale = await this.repository.listStalePendingFiles(this.db, staleBefore, BATCH_SIZE);

    for (const file of stale) {
      await this.repository.updateFileStatus(this.db, file.id, "FAILED");
    }

    const expired = await this.repository.listExpiredUploads(this.db, now, BATCH_SIZE);

    for (const upload of expired) {
      await this.removeExpiredUpload(upload);
    }

    const variants = await cleanupOrphanedObjects({
      storage: this.storage,
      prefix: "variants/",
      isReferenced: (key) => this.repository.isVariantKeyInUse(this.db, key),
    });
    const unreferenced = await cleanupOrphanedObjects({
      storage: this.storage,
      prefix: "media/",
      isReferenced: (key) => this.repository.isStorageKeyInUse(this.db, key),
    });
    const temporary = await cleanupOrphanedObjects({
      storage: this.storage,
      prefix: "tmp/",
      isReferenced: (key) => this.isRecent(key, staleBefore),
    });

    return {
      objectsOfDeletedFiles: results.filter(Boolean).length,
      staleUploads: stale.length,
      expiredUploads: expired.length,
      orphanedObjects: unreferenced.deleted + temporary.deleted + variants.deleted,
    };
  }

  /** The object of an upload being finished may already exist, so it goes as well. */
  private async removeExpiredUpload(upload: MediaUploadRow): Promise<void> {
    try {
      await this.storage.abortMultipartUpload(upload.storageKey, upload.storageUploadId);
      await this.storage.delete(upload.storageKey);
      await this.repository.deleteUpload(this.db, upload.id);
    } catch (error) {
      this.logger.error({ error, uploadId: upload.id }, "Could not remove an expired upload");
    }
  }

  /** Without a way to know the age, the object could belong to a running upload, so it stays. */
  private async isRecent(key: string, staleBefore: Date): Promise<boolean> {
    const stat = await this.storage.stat?.(key);

    return !stat?.lastModified || stat.lastModified >= staleBefore;
  }
}
