import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import type { TrackedEntity } from "#core/history/types";
import { registerAppModules } from "#src/modules/index";
import { createTestEnv } from "#test/helpers/testEnv";

/** Everything the real modules register with the history. Opens no database connection. */
export async function loadRegisteredEntities(): Promise<readonly TrackedEntity[]> {
  const env = createTestEnv();
  const pool = createPgPool(env.DATABASE_URL);
  const container = createAppContainer({ config: env, pool });
  const app = Fastify();

  try {
    await registerAppModules(app, container);

    const history = container.ports.history;

    if (!history) {
      throw new Error("History port is missing");
    }

    return history.listEntities();
  } finally {
    await app.close();
    await pool.end();
  }
}
