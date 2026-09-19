import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { extensionFromFilename, normalizeFilename } from "#core/storage/filename";
import { StorageError } from "#core/storage/errors";
import {
  createStorageObjectKey,
  createTemporaryObjectKey,
} from "#core/storage/keys";
import type { StoragePort } from "#core/storage/port";
import { UploadInspectorTransform } from "#core/storage/uploadInspector";

export type PersistUploadMetadataInput = {
  objectId: string;
  ownerId: string;
  storageKey: string;
  originalFilename: string;
  normalizedFilename: string;
  contentType: string;
  contentLength: number;
  sha256: string;
};

export type IngestUploadAndPersistParams<T> = {
  storage: StoragePort;
  transactionManager: TransactionManager;
  uploadStream: Readable;
  declaredContentType: string;
  originalFilename: string;
  ownerId: string;
  namespace: string;
  maxUploadBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
  downloadUrlTtlSeconds?: number;
  persistMetadata: (db: AppDatabase, input: PersistUploadMetadataInput) => Promise<T>;
};

export type IngestUploadAndPersistResult<T> = {
  record: T;
  objectId: string;
  storageKey: string;
  contentType: string;
  contentLength: number;
  sha256: string;
  normalizedFilename: string;
  downloadUrl: string;
};

/**
 * Deletes an object without masking the original failure path.
 *
 * @param storage Storage adapter used for cleanup.
 * @param key Storage key to delete.
 * @returns Promise that always resolves, regardless of delete errors.
 */
async function bestEffortDelete(storage: StoragePort, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch {
    // Intentional no-op: best-effort cleanup should not mask the original error.
  }
}

/**
 * Promotes a staged upload object to its final key.
 *
 * @param storage Storage adapter that owns the staged object.
 * @param input Keys and metadata required for final object placement.
 * @returns Promise that resolves when the final object is persisted.
 */
async function finalizeTempObject(
  storage: StoragePort,
  input: {
    temporaryKey: string;
    finalKey: string;
    contentType: string;
    contentLength: number;
  },
): Promise<void> {
  if (storage.move) {
    await storage.move(input.temporaryKey, input.finalKey);
    return;
  }

  const sourceStream = await storage.getStream(input.temporaryKey);
  await storage.put({
    key: input.finalKey,
    stream: sourceStream,
    contentType: input.contentType,
    contentLength: input.contentLength,
  });
  await storage.delete(input.temporaryKey);
}

/**
 * Streams an upload into temporary storage, validates payload metadata, persists DB metadata,
 * and then atomically promotes the object to its final storage key.
 *
 * @param params Upload stream, validation settings, transaction manager, and metadata writer.
 * @returns Persisted record and finalized storage metadata, including a download URL.
 */
export async function ingestUploadAndPersist<T>(
  params: IngestUploadAndPersistParams<T>,
): Promise<IngestUploadAndPersistResult<T>> {
  const normalizedFilename = normalizeFilename(params.originalFilename);
  const objectId = randomUUID();
  const extension = extensionFromFilename(normalizedFilename);
  const keyData = createStorageObjectKey({
    namespace: params.namespace,
    ownerId: params.ownerId,
    objectId,
    extension,
  });

  const temporaryKey = createTemporaryObjectKey();
  const inspector = new UploadInspectorTransform({
    declaredMimeType: params.declaredContentType,
    allowedMimeTypes: params.allowedMimeTypes,
    maxBytes: params.maxUploadBytes,
  });
  const uploadErrorHandler = (error: unknown): void => {
    inspector.destroy(
      error instanceof Error
        ? error
        : new Error("Upload stream failed"),
    );
  };

  params.uploadStream.once("error", uploadErrorHandler);

  let record: T;

  try {
    await params.storage.put({
      key: temporaryKey,
      stream: params.uploadStream.pipe(inspector),
      contentType: params.declaredContentType,
    });

    const inspection = inspector.getResult();

    record = await params.transactionManager.inTransaction((db) =>
      params.persistMetadata(db, {
        objectId,
        ownerId: params.ownerId,
        storageKey: keyData.key,
        originalFilename: params.originalFilename,
        normalizedFilename,
        contentType: inspection.contentType,
        contentLength: inspection.contentLength,
        sha256: inspection.sha256,
      }),
    );

    await finalizeTempObject(params.storage, {
      temporaryKey,
      finalKey: keyData.key,
      contentType: inspection.contentType,
      contentLength: inspection.contentLength,
    });

    const downloadUrl = await params.storage.createDownloadUrl(
      keyData.key,
      params.downloadUrlTtlSeconds ?? 900,
    );

    return {
      record,
      objectId,
      storageKey: keyData.key,
      contentType: inspection.contentType,
      contentLength: inspection.contentLength,
      sha256: inspection.sha256,
      normalizedFilename,
      downloadUrl,
    };
  } catch (error) {
    await Promise.allSettled([
      bestEffortDelete(params.storage, temporaryKey),
      bestEffortDelete(params.storage, keyData.key),
    ]);

    if (error instanceof StorageError) {
      throw error;
    }

    throw new StorageError("UPLOAD_STREAM_FAILED", "Upload transaction failed", {
      details: {
        cause: error instanceof Error ? error.message : "unknown",
      },
    });
  } finally {
    params.uploadStream.off("error", uploadErrorHandler);
  }
}
