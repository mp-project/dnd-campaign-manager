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
