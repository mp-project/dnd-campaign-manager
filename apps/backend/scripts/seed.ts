import { fileURLToPath } from "node:url";

import {
  createDrizzleDb,
  createPgPool,
} from "#core/db/pool";
import { getEnv } from "#core/env";
import { runScript } from "#core/log/processErrors";
import { createScriptLogger } from "#core/log/scriptLogger";
import { seedBootstrapState } from "./seed/bootstrap.seed.js";
import { ensureDefaultRulesets } from "#src/modules/ruleset/defaults/ensureDefaultRulesets";

async function runSeed(logger = createScriptLogger("seed")): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.DATABASE_URL);

  try {
    const db = createDrizzleDb(pool);
    const bootstrapCreated = await seedBootstrapState(db);
    const createdRulesets = await ensureDefaultRulesets(db);

    if (!bootstrapCreated && createdRulesets === 0) {
      logger.info("Seed skipped, all baseline data already exists");
      return;
    }

    logger.info({ bootstrapCreated, createdRulesets }, "Seed completed");
  } finally {
    await pool.end();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  const logger = createScriptLogger("seed");

  void runScript(logger, "seed", () => runSeed(logger));
}

export { runSeed };
export { ensureDefaultRulesets, seedBootstrapState };
