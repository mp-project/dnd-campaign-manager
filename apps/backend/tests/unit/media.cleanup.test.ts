import { Readable } from "node:stream";

import type { AppDatabase } from "#core/db/pool";
import { InMemoryStorage } from "#core/storage/index";
import type { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
import { MediaCleanupService } from "#src/modules/media/service/MediaCleanupService";

const HOUR = 60 * 60 * 1000;

const put = (storage: InMemoryStorage, key: string) =>
  storage.put({ key, stream: Readable.from(Buffer.from("x")), contentType: "text/plain" });

function createRepository(overrides: Partial<MediaRepository> = {}): MediaRepository {
  return {
    listFilesWithObjectToDelete: async () => [],
    listStalePendingFiles: async () => [],
    updateFileObjectDeleted: async () => undefined,
    updateFileStatus: async () => null,
    isStorageKeyInUse: async () => false,
    isVariantKeyInUse: async () => false,
    listExpiredUploads: async () => [],
    listVariantsOfFile: async () => [],
    deleteUpload: async () => undefined,
    ...overrides,
  } as unknown as MediaRepository;
}

describe("media cleanup", () => {
  const logger = { error: jest.fn() };

  beforeEach(() => logger.error.mockClear());

  it("removes objects nothing refers to and keeps the others", async () => {
    const storage = new InMemoryStorage();

    await put(storage, "media/c/used.png");
    await put(storage, "media/c/orphan.png");
    await put(storage, "other/kept.png");

    const result = await new MediaCleanupService(
      {} as AppDatabase,
      createRepository({ isStorageKeyInUse: async (_db, key) => key.endsWith("used.png") }),
      storage,
      logger,
    ).run();

    expect(result.orphanedObjects).toBe(1);
    await expect(storage.listKeys()).resolves.toEqual(
      expect.arrayContaining(["media/c/used.png", "other/kept.png"]),
    );
    await expect(storage.exists("media/c/orphan.png")).resolves.toBe(false);
  });

  it("keeps temporary objects of running uploads and removes abandoned ones", async () => {
    const storage = new InMemoryStorage();

    await put(storage, "tmp/old");

    const cleanup = new MediaCleanupService({} as AppDatabase, createRepository(), storage, logger);

    await cleanup.run(new Date(Date.now() + HOUR / 2));
    await expect(storage.exists("tmp/old")).resolves.toBe(true);

    await cleanup.run(new Date(Date.now() + 2 * HOUR));
    await expect(storage.exists("tmp/old")).resolves.toBe(false);
  });

  it("gives up on uploads that never finished", async () => {
    const updateFileStatus = jest.fn(async () => null);
    const file = { id: "stale", storageKey: "media/c/stale.png" };
    const result = await new MediaCleanupService(
      {} as AppDatabase,
      createRepository({
        listStalePendingFiles: async () => [file] as never,
        updateFileStatus,
      }),
      new InMemoryStorage(),
      logger,
    ).run();

    expect(result.staleUploads).toBe(1);
    expect(updateFileStatus).toHaveBeenCalledWith({}, "stale", "FAILED");
  });

  it("retries deleted objects and only marks them once they are gone", async () => {
    const storage = new InMemoryStorage();
    const updateFileObjectDeleted = jest.fn(async () => undefined);
    const file = { id: "deleted", storageKey: "media/c/deleted.png" };
    const repository = createRepository({
      listFilesWithObjectToDelete: async () => [file] as never,
      isStorageKeyInUse: async () => true,
      updateFileObjectDeleted,
    });
    const failing = jest.spyOn(storage, "delete").mockRejectedValueOnce(new Error("Down"));
    const cleanup = new MediaCleanupService({} as AppDatabase, repository, storage, logger);

    await expect(cleanup.run()).resolves.toMatchObject({ objectsOfDeletedFiles: 0 });
    expect(updateFileObjectDeleted).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledTimes(1);

    await expect(cleanup.run()).resolves.toMatchObject({ objectsOfDeletedFiles: 1 });
    expect(updateFileObjectDeleted).toHaveBeenCalledTimes(1);

    failing.mockRestore();
  });
});
