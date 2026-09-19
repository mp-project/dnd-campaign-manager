import { fileURLToPath } from "node:url";

import {
  createDrizzleDb,
  createPgPool,
} from "#core/db/pool";
import { getEnv } from "#core/env";
import { seedBootstrapState } from "./seed/bootstrap.seed.js";
import { seedRulesets } from "./seed/ruleset.seed.js";

async function runSeed(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.DATABASE_URL);

  try {
    const db = createDrizzleDb(pool);
    const bootstrapCreated = await seedBootstrapState(db);
    const createdRulesets = await seedRulesets(db);

    if (!bootstrapCreated && createdRulesets === 0) {
      console.info("Seed skipped, all baseline data already exists.");
      return;
    }

    console.info(
      `Seed completed. bootstrapCreated=${bootstrapCreated} createdRulesets=${createdRulesets}`,
    );
  } finally {
    await pool.end();
  }
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runSeed();
}

export { runSeed };
export { seedBootstrapState, seedRulesets };
