import { Readable } from "node:stream";

import { InMemoryStorage, cleanupOrphanedObjects } from "#core/storage";

describe("cleanupOrphanedObjects", () => {
  it("deletes unreferenced keys and keeps referenced keys", async () => {
    const storage = new InMemoryStorage();

    await storage.put({
      key: "media/keep.bin",
      stream: Readable.from(Buffer.from("keep")),
      contentType: "application/octet-stream",
    });

    await storage.put({
      key: "media/remove.bin",
      stream: Readable.from(Buffer.from("remove")),
      contentType: "application/octet-stream",
    });

    const referencedKeys = new Set(["media/keep.bin"]);

    const result = await cleanupOrphanedObjects({
      storage,
      prefix: "media/",
      isReferenced: async (key: string) => referencedKeys.has(key),
    });

    expect(result).toEqual({
      scanned: 2,
      deleted: 1,
      skipped: 1,
    });

    await expect(storage.exists("media/keep.bin")).resolves.toBe(true);
    await expect(storage.exists("media/remove.bin")).resolves.toBe(false);
  });
});
