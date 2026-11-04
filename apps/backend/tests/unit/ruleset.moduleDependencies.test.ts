import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
  rulesetModule,
} from "#src/modules/ruleset/index";
import { authModule } from "#src/modules/auth/index";
import { historyModule } from "#src/modules/history/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("ruleset module dependency injection", () => {
  it("registers module dependencies under the ruleset token", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await authModule.register(app, container);
      await historyModule.register(app, container);
      await rulesetModule.register(app, container);

      const dependencies =
        container.dependencies.get<RulesetModuleDependencies>(
          RULESET_MODULE_DEPENDENCIES,
        );

      expect(dependencies).toBeDefined();
      expect(rulesetModule.dependencies).toEqual(["system", "history"]);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("fails fast when the history module is not registered", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await expect(rulesetModule.register(app, container)).rejects.toThrow(
        "History port is missing",
      );
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
