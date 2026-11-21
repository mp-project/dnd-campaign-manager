import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { getEnv } from "#core/env";
import { runWithLogContext } from "#core/log/logContext";
import { createLogger, loggerSettingsFromEnv } from "#core/log/logger";
import { installProcessErrorHandlers } from "#core/log/processErrors";
import { reportError } from "#core/log/reportError";
import { createStoragePortFromEnv } from "#core/storage/index";
import { shutdownTelemetry } from "#core/telemetry/lifecycle";
import { MediaRepository } from "#src/modules/media/domain/repository/MediaRepository";
import { MediaVariantService } from "#src/modules/media/service/MediaVariantService";

const IDLE_DELAY_MS = 3000;

/** Generates image variants until it gets a signal to stop; a job in progress still finishes. */
async function runWorker(): Promise<void> {
  const env = getEnv();
  const logger = createLogger(loggerSettingsFromEnv(env, "media-worker"));
  const pool = createPgPool(env.DATABASE_URL);
  const stop = new AbortController();

  installProcessErrorHandlers(logger, () => pool.end());
  process.once("SIGTERM", () => stop.abort());
  process.once("SIGINT", () => stop.abort());

  const variants = new MediaVariantService(
    createDrizzleDb(pool),
    new MediaRepository(),
    createStoragePortFromEnv(env),
    logger,
  );

  logger.info("Media worker started");

  try {
    while (!stop.signal.aborted) {
      const worked = await runWithLogContext({ task: "media.variants" }, () =>
        variants.processNext(),
      ).catch((error: unknown) => {
        // Usually the database; the worker waits and asks again instead of ending.
        reportError(logger, error, "Media worker could not get its next job", {
          task: "media.variants",
        });

        return false;
      });

      if (!worked) {
        // Aborting the wait is how the worker stops; there is nothing to handle.
        await sleep(IDLE_DELAY_MS, undefined, { signal: stop.signal }).catch(() => undefined);
      }
    }
  } finally {
    await pool.end();
    logger.info("Media worker stopped");
    await shutdownTelemetry();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runWorker();
}
