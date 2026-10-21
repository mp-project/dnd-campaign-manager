import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
  assetsModule,
} from "#src/modules/assets/index";
import { authModule } from "#src/modules/auth/index";
import { campaignsModule } from "#src/modules/campaigns/index";
import { rulesetModule } from "#src/modules/ruleset/index";
import { usersModule } from "#src/modules/users/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("assets module dependency injection", () => {
  it("registers module dependencies under the assets token", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await authModule.register(app, container);
      await usersModule.register(app, container);
      await rulesetModule.register(app, container);
      await campaignsModule.register(app, container);
      await assetsModule.register(app, container);

      const dependencies = container.dependencies.get<AssetsModuleDependencies>(
        ASSETS_MODULE_DEPENDENCIES,
      );

      expect(dependencies?.service).toBeDefined();
      expect(assetsModule.dependencies).toEqual(["system", "auth", "ruleset", "campaigns"]);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("fails fast when the campaigns module is not registered", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await expect(assetsModule.register(app, container)).rejects.toThrow(
        "Campaigns module dependencies are missing",
      );
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
