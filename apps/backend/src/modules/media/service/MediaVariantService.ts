import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import sharp from "sharp";

import type { AppDatabase } from "#core/db/pool";
import type { StoragePort } from "#core/storage/index";
import type {
  MediaFileRow,
  MediaRepository,
  MediaVariantRow,
} from "#src/modules/media/domain/repository/MediaRepository";

const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 15 * 60 * 1000;

const VARIANT_PROFILES: Record<MediaVariantRow["kind"], { maxEdge: number; quality: number }> = {
  /** For lists and galleries. */
  THUMBNAIL: { maxEdge: 480, quality: 70 },
  /** For showing an image on a page; zooming into a large map uses the original. */
  DISPLAY: { maxEdge: 2560, quality: 80 },
};

export type MediaVariantLogger = {
  error(details: unknown, message?: string): void;
};

/**
 * Generates the WebP variants of images. This is expensive and belongs in the worker process
 * (`media:worker`), so the API stays responsive; several workers can run side by side. The original
 * goes to a temporary file first, so a large image doesn't have to fit into memory.
 */
export class MediaVariantService {
  constructor(
    private readonly db: AppDatabase,
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
    private readonly logger: MediaVariantLogger,
  ) {}

  /** Handles one file; returns false when nothing is waiting. */
  async processNext(now: Date = new Date()): Promise<boolean> {
    const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);

    await this.repository.updateVariantsExhausted(this.db, {
      staleBefore,
      maxAttempts: MAX_ATTEMPTS,
    });

    const variants = await this.db.transaction((tx) =>
      this.repository.claimNextVariants(tx as unknown as AppDatabase, {
        now,
        staleBefore,
        maxAttempts: MAX_ATTEMPTS,
      }),
    );
    const mediaId = variants[0]?.mediaId;

    if (!mediaId) {
      return false;
    }

    const file = await this.repository.findFileById(this.db, mediaId);

    try {
      if (!file) {
        throw new Error("The file no longer exists");
      }

      await this.generate(file, variants);
    } catch (error) {
      this.logger.error({ error, mediaId }, "Could not generate the variants of a media file");

      await Promise.all(
        variants.map((variant) =>
          this.repository.updateVariant(this.db, variant.id, {
            status: file && variant.attempts < MAX_ATTEMPTS ? "PENDING" : "FAILED",
          }),
        ),
      );
    }

    return true;
  }

  private async generate(file: MediaFileRow, variants: MediaVariantRow[]): Promise<void> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "media-variant-"));
    const original = path.join(directory, "original");

    try {
      await pipeline(await this.storage.getStream(file.storageKey), createWriteStream(original));

      const metadata = await sharp(original).metadata();

      await this.repository.updateFileDimensions(this.db, file.id, {
        width: metadata.autoOrient.width,
        height: metadata.autoOrient.height,
      });

      for (const variant of variants) {
        await this.generateVariant(original, variant);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async generateVariant(original: string, variant: MediaVariantRow): Promise<void> {
    const { maxEdge, quality } = VARIANT_PROFILES[variant.kind];
    const { data, info } = await sharp(original)
      .autoOrient()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });

    await this.storage.put({
      key: variant.storageKey,
      stream: Readable.from(data),
      contentType: variant.mimeType,
    });
    await this.repository.updateVariant(this.db, variant.id, {
      status: "READY",
      sizeBytes: data.length,
      width: info.width,
      height: info.height,
    });
  }
}
