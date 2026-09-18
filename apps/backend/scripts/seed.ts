import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";

import { createPgPool } from "../src/core/db/pool.js";
import { getEnv } from "../src/core/env.js";
import { systemRuntimeState } from "../src/core/db/schema.js";

async function runSeed(): Promise<void> {
  const env = getEnv();
  const pool = createPgPool(env.DATABASE_URL);

  try {
    const db = drizzle(pool);

    const existingBootstrapState = await db
      .select({ id: systemRuntimeState.id })
      .from(systemRuntimeState)
      .where(
        and(
          eq(systemRuntimeState.stateKey, "bootstrap"),
          isNull(systemRuntimeState.deletedAt),
        ),
      )
      .limit(1);

    if (existingBootstrapState.length > 0) {
      console.info("Seed skipped, bootstrap runtime state already exists.");
      return;
    }

    await db.insert(systemRuntimeState).values({
      stateKey: "bootstrap",
      value: {
        seededAt: new Date().toISOString(),
      },
    });

    console.info("Seed completed.");
  } finally {
    await pool.end();
  }
}

void runSeed();
