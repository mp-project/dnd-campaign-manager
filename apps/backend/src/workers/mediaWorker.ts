import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { getEnv } from "#core/env";
import { runWithLogContext } from "#core/log/logContext";
import { getErrorReporter } from "#core/log/errorReporter";
import { createLogger, loggerSettingsFromEnv } from "#core/log/logger";
import { installProcessErrorHandlers } from "#core/log/processErrors";
import { reportError } from "#core/log/reportError";
import { warnMissingIntegrations } from "#core/runtime/integrations";
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

  // Without S3 no upload completes, so there is nothing to process; the worker keeps polling.
  warnMissingIntegrations(logger, env, ["storage"]);
  logger.info("Media worker started");

  // A database outage fails every poll; only the first failure of a series is reported, the
  // rest is a warning until a poll succeeds again.
  let failing = false;

  try {
    while (!stop.signal.aborted) {
      const worked = await runWithLogContext({ task: "media.variants" }, () =>
        variants.processNext(),
      )
        .then((result) => {
          failing = false;
          return result;
        })
        .catch((error: unknown) => {
          // Usually the database; the worker waits and asks again instead of ending.
          if (failing) {
            logger.warn({ err: error, task: "media.variants" }, "Media worker still cannot get its next job");
          } else {
            reportError(logger, error, "Media worker could not get its next job", {
              task: "media.variants",
            });
          }
          failing = true;

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
    await getErrorReporter().flush();
    await shutdownTelemetry();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runWorker();
}
