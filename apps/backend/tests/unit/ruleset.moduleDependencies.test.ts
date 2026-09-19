import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
  rulesetModule,
} from "#src/modules/ruleset/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("ruleset module dependency injection", () => {
  it("registers module dependencies under the ruleset token", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await rulesetModule.register(app, container);

      const dependencies =
        container.dependencies.get<RulesetModuleDependencies>(
          RULESET_MODULE_DEPENDENCIES,
        );

      expect(dependencies).toBeDefined();
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
