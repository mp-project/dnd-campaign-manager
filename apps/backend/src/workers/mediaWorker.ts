import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { getEnv } from "#core/env";
import { createStoragePortFromEnv } from "#core/storage/index";
import { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
import { MediaVariantService } from "#src/modules/media/service/MediaVariantService";

const IDLE_DELAY_MS = 3000;

/** Generates image variants until it gets a signal to stop; a job in progress still finishes. */
async function runWorker(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.DATABASE_URL);
  const stop = new AbortController();

  process.once("SIGTERM", () => stop.abort());
  process.once("SIGINT", () => stop.abort());

  const variants = new MediaVariantService(
    createDrizzleDb(pool),
    new MediaRepository(),
    createStoragePortFromEnv(env),
    { error: (details, message) => console.error(message, details) },
  );

  console.info("Media worker started.");

  try {
    while (!stop.signal.aborted) {
      const worked = await variants.processNext().catch((error: unknown) => {
        console.error("Media worker could not get its next job.", error);

        return false;
      });

      if (!worked) {
        await sleep(IDLE_DELAY_MS, undefined, { signal: stop.signal }).catch(() => undefined);
      }
    }
  } finally {
    await pool.end();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runWorker();
}
