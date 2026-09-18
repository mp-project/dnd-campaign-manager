import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { PersistUploadMetadataInput } from "#core/storage";
import { InMemoryStorage, StorageError, ingestUploadAndPersist } from "#core/storage";

const pngPayload = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x01, 0x02, 0x03,
]);

function createTransactionManager(): TransactionManager {
  return {
    inTransaction: async <T>(work: (db: AppDatabase) => Promise<T>): Promise<T> =>
      work({} as AppDatabase),
  };
}

describe("ingestUploadAndPersist", () => {
  it("ingests a valid upload and finalizes object after metadata write", async () => {
    const storage = new InMemoryStorage();
    const ownerId = randomUUID();

    const result = await ingestUploadAndPersist({
      storage,
      transactionManager: createTransactionManager(),
      uploadStream: Readable.from(pngPayload),
      declaredContentType: "image/png",
      originalFilename: "avatar.png",
      ownerId,
      namespace: "media",
      maxUploadBytes: 1024,
      allowedMimeTypes: new Set(["image/png"]),
      persistMetadata: async (
        _db: AppDatabase,
        input: PersistUploadMetadataInput,
      ) => ({ id: input.objectId }),
    });

    expect(result.record).toEqual({ id: result.objectId });
    expect(result.contentLength).toBe(pngPayload.length);
    expect(result.storageKey).toMatch(new RegExp(`^media/${ownerId}/`));
    expect(result.storageKey.endsWith(".png")).toBe(true);
    await expect(storage.exists(result.storageKey)).resolves.toBe(true);
  });

  it("rejects uploads above max size", async () => {
    const storage = new InMemoryStorage();

    await expect(
      ingestUploadAndPersist({
        storage,
        transactionManager: createTransactionManager(),
        uploadStream: Readable.from(Buffer.alloc(32, 1)),
        declaredContentType: "text/plain",
        originalFilename: "notes.txt",
        ownerId: randomUUID(),
        namespace: "media",
        maxUploadBytes: 16,
        allowedMimeTypes: new Set(["text/plain"]),
        persistMetadata: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject<Partial<StorageError>>({
      code: "MAX_UPLOAD_SIZE_EXCEEDED",
    });

    await expect(storage.listKeys()).resolves.toEqual([]);
  });

  it("rejects MIME spoofing", async () => {
    const storage = new InMemoryStorage();

    await expect(
      ingestUploadAndPersist({
        storage,
        transactionManager: createTransactionManager(),
        uploadStream: Readable.from(pngPayload),
        declaredContentType: "application/pdf",
        originalFilename: "document.pdf",
        ownerId: randomUUID(),
        namespace: "media",
        maxUploadBytes: 1024,
        allowedMimeTypes: new Set(["application/pdf"]),
        persistMetadata: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject<Partial<StorageError>>({
      code: "CONTENT_TYPE_MISMATCH",
    });
  });

  it("normalizes unsafe filenames", async () => {
    const storage = new InMemoryStorage();

    const result = await ingestUploadAndPersist({
      storage,
      transactionManager: createTransactionManager(),
      uploadStream: Readable.from(pngPayload),
      declaredContentType: "image/png",
      originalFilename: "../../dangerous-path.png",
      ownerId: randomUUID(),
      namespace: "media",
      maxUploadBytes: 1024,
      allowedMimeTypes: new Set(["image/png"]),
      persistMetadata: async (
        _db: AppDatabase,
        input: PersistUploadMetadataInput,
      ) => ({ filename: input.normalizedFilename }),
    });

    expect(result.normalizedFilename).toBe("dangerous-path.png");
  });

  it("rolls back storage object when metadata write fails", async () => {
    const storage = new InMemoryStorage();

    await expect(
      ingestUploadAndPersist({
        storage,
        transactionManager: createTransactionManager(),
        uploadStream: Readable.from(pngPayload),
        declaredContentType: "image/png",
        originalFilename: "avatar.png",
        ownerId: randomUUID(),
        namespace: "media",
        maxUploadBytes: 1024,
        allowedMimeTypes: new Set(["image/png"]),
        persistMetadata: async () => {
          throw new Error("db failed");
        },
      }),
    ).rejects.toMatchObject<Partial<StorageError>>({
      code: "UPLOAD_STREAM_FAILED",
    });

    await expect(storage.listKeys()).resolves.toEqual([]);
  });

  it("handles upload stream errors", async () => {
    const storage = new InMemoryStorage();

    const failingStream = Readable.from(Buffer.from("data")).pipe(
      new Transform({
        transform(_chunk, _encoding, callback) {
          callback(new Error("stream aborted"));
        },
      }),
    );

    await expect(
      ingestUploadAndPersist({
        storage,
        transactionManager: createTransactionManager(),
        uploadStream: failingStream,
        declaredContentType: "text/plain",
        originalFilename: "notes.txt",
        ownerId: randomUUID(),
        namespace: "media",
        maxUploadBytes: 1024,
        allowedMimeTypes: new Set(["text/plain"]),
        persistMetadata: async () => ({ ok: true }),
      }),
    ).rejects.toMatchObject<Partial<StorageError>>({
      code: "UPLOAD_STREAM_FAILED",
    });
  });
});
