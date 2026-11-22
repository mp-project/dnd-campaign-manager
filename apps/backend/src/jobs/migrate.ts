import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { createDrizzleDb, createPgPool, runDatabaseMigrations } from "#core/db/pool";
import { getEnv } from "#core/env";
import { runScript } from "#core/log/processErrors";
import { createScriptLogger } from "#core/log/scriptLogger";

// A database that was just started (or a network that lets a new pod through only after a few
// seconds) refuses the first connections; waiting up to two minutes covers both.
const CONNECT_ATTEMPTS = 40;
const CONNECT_DELAY_MS = 3000;

const logger = createScriptLogger("db-migrate");

/**
 * Applies the pending migrations from `drizzle/migrations` with drizzle-orm's migrator, so the
 * production image needs no drizzle-kit. Same journal table as `npm run db:migrate`.
 */
async function runMigrations(): Promise<void> {
  const pool = createPgPool(getEnv().DATABASE_URL);

  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await pool.query("select 1");
        break;
      } catch (error) {
        if (attempt >= CONNECT_ATTEMPTS) {
          throw error;
        }

        // Expected while the database starts; the last attempt's error is reported above.
        logger.warn({ err: error, attempt }, "Database not reachable yet, trying again");
        await sleep(CONNECT_DELAY_MS);
      }
    }

    await runDatabaseMigrations(createDrizzleDb(pool));
    logger.info("Database migrations applied");
  } finally {
    await pool.end();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runScript(logger, "db-migrate", runMigrations);
}
