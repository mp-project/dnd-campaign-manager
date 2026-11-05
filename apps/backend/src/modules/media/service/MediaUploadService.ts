import { randomUUID } from "node:crypto";
import { Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  assertAllowedMimeType,
  createStorageObjectKey,
  extensionFromFilename,
  normalizeFilename,
  type StoragePort,
  UploadInspectorTransform,
} from "#core/storage/index";
import type { CreateMediaUploadDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import { MEDIA_VARIANT_KINDS } from "#src/modules/media/domain/entities/MediaTable";
import type {
  MediaFileRow,
  MediaRepository,
  MediaUploadRow,
} from "#src/modules/media/domain/repository/MediaRepository";
import type { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";

/** S3 needs at least 5 MiB except for the last part and allows 10000 parts: enough for 78 GiB. */
const PART_SIZE_BYTES = 8 * 1024 * 1024;
const UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VARIANT_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type MediaUploadConfig = {
  allowedMimeTypes: ReadonlySet<string>;
};

/** Keeps names readable while removing what could break a header or a display. */
function toOriginalName(filename: string): string {
  const basename = filename.replace(/\\/g, "/").split("/").at(-1) ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = basename.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  return (cleaned || "file").slice(0, 255);
}

function partCountOf(upload: MediaUploadRow): number {
  return Math.ceil(upload.sizeBytes / upload.partSizeBytes);
}

function expectedPartSize(upload: MediaUploadRow, partNumber: number): number {
  return partNumber < partCountOf(upload)
    ? upload.partSizeBytes
    : upload.sizeBytes - upload.partSizeBytes * (partCountOf(upload) - 1);
}

/**
 * Uploads in parts through the API: a client that loses its connection asks which parts arrived and
 * sends the rest. The size is announced up front, so limits apply before any byte is sent. The
 * content can only be checked once all parts are there, so a wrong file is removed on completion.
 */
export class MediaUploadService {
  constructor(
    public readonly db: AppDatabase,
    private readonly transactionManager: TransactionManager,
    private readonly repository: MediaRepository,
    private readonly storage: StoragePort,
    private readonly quota: MediaQuotaService,
    private readonly config: MediaUploadConfig,
  ) {}

  async create(params: {
    campaignId: string;
    actorId: string;
    systemRole: RequestContext["systemRole"];
    input: CreateMediaUploadDto;
  }): Promise<MediaUploadRow> {
    const { campaignId, actorId, systemRole, input } = params;
    const mimeType = assertAllowedMimeType(input.mimeType, this.config.allowedMimeTypes);
    const now = new Date();
    const owner = await this.repository.findCampaignOwner(this.db, campaignId);

    if (!owner) {
      throw new NotFoundError("Campaign not found");
    }

    const check = {
      campaignId,
      limits: await this.quota.findLimits(campaignId),
      mimeType,
      sizeBytes: input.sizeBytes,
      now,
      revealLimits: this.quota.maySeeUsage(owner, { actorId, systemRole }),
    };

    // Before the storage is involved; repeated with the lock below, when it counts.
    await this.quota.assertWithinLimits(this.db, check);

    const originalName = toOriginalName(input.originalName);
    const id = randomUUID();
    const { key } = createStorageObjectKey({
      namespace: "media",
      ownerId: campaignId,
      objectId: id,
      extension: extensionFromFilename(normalizeFilename(originalName)),
    });
    const storageUploadId = await this.storage.createMultipartUpload(key, mimeType);

    try {
      return await this.transactionManager.inTransaction(async (tx) => {
        const locked = await this.repository.lockCampaignWithOwner(tx, campaignId);

        if (!locked) {
          throw new NotFoundError("Campaign not found");
        }

        await this.quota.assertWithinLimits(tx, check);

        return this.repository.createUpload(tx, {
          id,
          campaignId,
          storageKey: key,
          storageUploadId,
          originalName,
          mimeType,
          sizeBytes: input.sizeBytes,
          partSizeBytes: PART_SIZE_BYTES,
          title: input.title ?? null,
          altText: input.altText ?? null,
          expiresAt: new Date(now.getTime() + UPLOAD_LIFETIME_MS),
          createdBy: actorId,
          updatedBy: actorId,
        });
      });
    } catch (error) {
      await this.storage.abortMultipartUpload(key, storageUploadId).catch(() => undefined);

      throw error;
    }
  }

  /** Only whoever started the upload can continue it. */
  async require(params: {
    campaignId: string;
    uploadId: string;
    actorId: string;
  }): Promise<MediaUploadRow> {
    const upload = await this.repository.findUploadById(this.db, params.uploadId);

    if (
      !upload ||
      upload.campaignId !== params.campaignId ||
      upload.createdBy !== params.actorId ||
      upload.expiresAt <= new Date()
    ) {
      throw new NotFoundError("Upload not found");
    }

    return upload;
  }

  /** The storage knows best which parts arrived, so nothing is tracked twice. */
  async listUploadedParts(upload: MediaUploadRow): Promise<number[]> {
    const parts = await this.storage.listParts(upload.storageKey, upload.storageUploadId);

    return parts.map((part) => part.partNumber);
  }

  async uploadPart(params: {
    upload: MediaUploadRow;
    partNumber: number;
    contentLength: number | null;
    stream: Readable;
  }): Promise<{ partNumber: number; sizeBytes: number }> {
    const { upload, partNumber, contentLength, stream } = params;

    this.assertActive(upload);

    if (partNumber > partCountOf(upload)) {
      throw new ValidationError("This upload has no such part", { partCount: partCountOf(upload) });
    }

    const expected = expectedPartSize(upload, partNumber);

    if (contentLength !== expected) {
      throw new ValidationError("The part has the wrong size", { expectedBytes: expected });
    }

    const part = await this.storage.uploadPart({
      key: upload.storageKey,
      uploadId: upload.storageUploadId,
      partNumber,
      stream,
      contentLength,
    });

    return { partNumber, sizeBytes: part.sizeBytes };
  }

  async abort(upload: MediaUploadRow): Promise<void> {
    this.assertActive(upload);

    await this.storage.abortMultipartUpload(upload.storageKey, upload.storageUploadId);
    await this.repository.deleteUpload(this.db, upload.id);
  }

  /**
   * Joins the parts, then reads the result once to check its type and calculate its hash. Only then
   * does the file exist; the same transaction ends the reservation against the quota.
   */
  async complete(upload: MediaUploadRow): Promise<MediaFileRow> {
    const claimed = await this.repository.updateUploadToCompleting(
      this.db,
      upload.id,
      new Date(),
    );

    if (!claimed) {
      throw new ConflictError("The upload is already being completed");
    }

    await this.joinParts(claimed);

    try {
      const inspection = await this.inspect(claimed);

      return await this.transactionManager.inTransaction(async (tx) => {
        await this.repository.createFile(tx, {
          id: claimed.id,
          campaignId: claimed.campaignId,
          scope: "CAMPAIGN",
          storageKey: claimed.storageKey,
          originalName: claimed.originalName,
          mimeType: inspection.contentType,
          sizeBytes: inspection.contentLength,
          sha256: inspection.sha256,
          status: "READY",
          uploadedBy: claimed.createdBy,
          title: claimed.title,
          altText: claimed.altText,
          createdBy: claimed.createdBy,
          updatedBy: claimed.createdBy,
        });

        if (VARIANT_MIME_TYPES.has(inspection.contentType)) {
          await this.repository.createVariants(
            tx,
            MEDIA_VARIANT_KINDS.map((kind) => ({
              mediaId: claimed.id,
              kind,
              storageKey: `variants/${claimed.id}/${kind.toLowerCase()}.webp`,
              mimeType: "image/webp",
              createdBy: claimed.createdBy,
              updatedBy: claimed.createdBy,
            })),
          );
        }

        await this.repository.deleteUpload(tx, claimed.id);

        return (await this.repository.findFileById(tx, claimed.id)) as MediaFileRow;
      });
    } catch (error) {
      // The parts are gone once joined, so this upload can't be tried again.
      await this.storage.delete(claimed.storageKey).catch(() => undefined);
      await this.repository.deleteUpload(this.db, claimed.id).catch(() => undefined);

      throw error;
    }
  }

  /** On a failure here the parts still exist, so the client can send what's missing and retry. */
  private async joinParts(upload: MediaUploadRow): Promise<void> {
    try {
      const parts = await this.storage.listParts(upload.storageKey, upload.storageUploadId);
      const sizes = new Map(parts.map((part) => [part.partNumber, part.sizeBytes]));
      const missingParts = Array.from({ length: partCountOf(upload) }, (_, index) => index + 1).filter(
        (partNumber) => sizes.get(partNumber) !== expectedPartSize(upload, partNumber),
      );

      if (missingParts.length > 0) {
        throw new ConflictError("Parts of the upload are missing", { missingParts });
      }

      await this.storage.completeMultipartUpload(
        upload.storageKey,
        upload.storageUploadId,
        parts.sort((a, b) => a.partNumber - b.partNumber),
      );
    } catch (error) {
      await this.repository.updateUploadToActive(this.db, upload.id).catch(() => undefined);

      throw error;
    }
  }

  private async inspect(upload: MediaUploadRow) {
    const inspector = new UploadInspectorTransform({
      declaredMimeType: upload.mimeType,
      allowedMimeTypes: this.config.allowedMimeTypes,
      maxBytes: upload.sizeBytes,
    });
    const discard = new Writable({
      write: (_chunk, _encoding, callback) => callback(),
    });

    await pipeline(await this.storage.getStream(upload.storageKey), inspector, discard);

    return inspector.getResult();
  }

  private assertActive(upload: MediaUploadRow): void {
    if (upload.status !== "ACTIVE") {
      throw new ConflictError("The upload is already being completed");
    }
  }
}
