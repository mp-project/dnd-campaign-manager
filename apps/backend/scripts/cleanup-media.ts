import { fileURLToPath } from "node:url";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { getEnv } from "#core/env";
import { createStoragePortFromEnv } from "#core/storage/index";
import { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
import { MediaCleanupService } from "#src/modules/media/service/MediaCleanupService";

/** Repairs what interrupted uploads and deletions leave behind; meant for a regular schedule. */
async function runCleanup(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.DATABASE_URL);

  try {
    const cleanup = new MediaCleanupService(
      createDrizzleDb(pool),
      new MediaRepository(),
      createStoragePortFromEnv(env),
      { error: (details: unknown, message?: string) => console.error(message, details) },
    );

    console.info("Media cleanup completed.", await cleanup.run());
  } finally {
    await pool.end();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runCleanup();
}
