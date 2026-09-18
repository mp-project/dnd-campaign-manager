import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { InMemoryStorage, LocalStorage } from "#core/storage";
import { runStoragePortContract } from "#test/unit/storage-port.contract";

runStoragePortContract("InMemoryStorage", () => ({
  storage: new InMemoryStorage(),
}));

runStoragePortContract("LocalStorage", async () => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "dnd-storage-"));

  return {
    storage: new LocalStorage({
      rootDirectory,
      downloadBaseUrl: "http://api.localhost:3000",
    }),
    cleanup: async () => {
      await rm(rootDirectory, { recursive: true, force: true });
    },
  };
});
