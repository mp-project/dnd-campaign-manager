import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
  campaignsModule,
} from "#src/modules/campaigns/index";
import { rulesetModule } from "#src/modules/ruleset/index";
import { authModule } from "#src/modules/auth/index";
import { usersModule } from "#src/modules/users/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("campaigns module dependency injection", () => {
  it("registers module dependencies under the campaigns token", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await authModule.register(app, container);
      await usersModule.register(app, container);
      await rulesetModule.register(app, container);
      await campaignsModule.register(app, container);

      const dependencies = container.dependencies.get<CampaignsModuleDependencies>(
        CAMPAIGNS_MODULE_DEPENDENCIES,
      );

      expect(dependencies).toBeDefined();
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
