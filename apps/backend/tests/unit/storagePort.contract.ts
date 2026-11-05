import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { StoragePort } from "#core/storage";

type StorageFactoryResult = {
  storage: StoragePort;
  cleanup?: () => Promise<void> | void;
};

type StorageFactory = () => Promise<StorageFactoryResult> | StorageFactoryResult;

async function readStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export function runStoragePortContract(name: string, createStorage: StorageFactory): void {
  describe(`${name} StoragePort contract`, () => {
    let storage: StoragePort;
    let cleanup: (() => Promise<void> | void) | undefined;

    beforeEach(async () => {
      const created = await createStorage();
      storage = created.storage;
      cleanup = created.cleanup;
    });

    afterEach(async () => {
      await cleanup?.();
    });

    it("stores and retrieves content", async () => {
      const key = `contract/${randomUUID()}.txt`;
      const payload = Buffer.from("hello world");

      await storage.put({
        key,
        stream: Readable.from(payload),
        contentType: "text/plain",
      });

      const retrieved = await storage.getStream(key);
      await expect(readStream(retrieved)).resolves.toEqual(payload);
      await expect(storage.exists(key)).resolves.toBe(true);
    });

    it("deletes existing content", async () => {
      const key = `contract/${randomUUID()}.txt`;

      await storage.put({
        key,
        stream: Readable.from(Buffer.from("to-delete")),
        contentType: "text/plain",
      });

      await storage.delete(key);
      await expect(storage.exists(key)).resolves.toBe(false);
    });

    it("creates download url", async () => {
      const key = `contract/${randomUUID()}.txt`;
      const url = await storage.createDownloadUrl(key, 60);

      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });

    it("joins parts sent in any order, and only then shows the object", async () => {
      const key = `contract/${randomUUID()}.bin`;
      const first = Buffer.alloc(5 * 1024 * 1024, 1);
      const second = Buffer.from("the end");
      const uploadId = await storage.createMultipartUpload(key, "application/octet-stream");

      await storage.uploadPart({
        key,
        uploadId,
        partNumber: 2,
        stream: Readable.from(second),
        contentLength: second.length,
      });
      await storage.uploadPart({
        key,
        uploadId,
        partNumber: 1,
        stream: Readable.from(first),
        contentLength: first.length,
      });

      await expect(storage.exists(key)).resolves.toBe(false);

      const parts = await storage.listParts(key, uploadId);

      expect(parts.map((part) => [part.partNumber, part.sizeBytes])).toEqual([
        [1, first.length],
        [2, second.length],
      ]);

      await storage.completeMultipartUpload(key, uploadId, parts);

      await expect(readStream(await storage.getStream(key))).resolves.toEqual(
        Buffer.concat([first, second]),
      );
      await storage.delete(key);
    }, 30_000);

    it("aborts an upload, also repeatedly", async () => {
      const key = `contract/${randomUUID()}.bin`;
      const uploadId = await storage.createMultipartUpload(key, "text/plain");

      await storage.uploadPart({
        key,
        uploadId,
        partNumber: 1,
        stream: Readable.from(Buffer.from("x")),
        contentLength: 1,
      });
      await storage.abortMultipartUpload(key, uploadId);
      await expect(storage.abortMultipartUpload(key, uploadId)).resolves.toBeUndefined();
      await expect(storage.exists(key)).resolves.toBe(false);
    });

    it("moves objects when move is supported", async () => {
      if (!storage.move) {
        return;
      }

      const fromKey = `contract/${randomUUID()}.txt`;
      const toKey = `contract/${randomUUID()}.txt`;
      const payload = Buffer.from("move me");

      await storage.put({
        key: fromKey,
        stream: Readable.from(payload),
        contentType: "text/plain",
      });

      await storage.move(fromKey, toKey);

      await expect(storage.exists(fromKey)).resolves.toBe(false);
      await expect(storage.exists(toKey)).resolves.toBe(true);

      const moved = await storage.getStream(toKey);
      await expect(readStream(moved)).resolves.toEqual(payload);
    });
  });
}
