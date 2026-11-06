import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/index";
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
  featuresModule,
} from "#src/modules/features/index";
import { registerAppModules } from "#src/modules/index";
import { createTestEnv } from "#test/helpers/testEnv";

async function withContainer(
  work: (
    app: ReturnType<typeof Fastify>,
    container: ReturnType<typeof createAppContainer>,
  ) => Promise<void>,
) {
  const env = createTestEnv();
  const pool = createPgPool(env.DATABASE_URL);
  const container = createAppContainer({ config: env, pool });
  const app = Fastify();

  try {
    await work(app, container);
  } finally {
    await app.close();
    await pool.end();
  }
}

describe("features module dependency injection", () => {
  it("publishes its port, tracks features as children of assets and makes features shareable", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      expect(
        container.dependencies.get<FeaturesModuleDependencies>(FEATURES_MODULE_DEPENDENCIES)
          ?.service,
      ).toBeDefined();
      expect(featuresModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "content-shares",
      ]);

      const feature = container.ports.history
        ?.listEntities()
        .find((item) => item.type === "feature");

      expect(feature?.table).toBeDefined();
      expect(feature?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });
      expect(
        container.dependencies
          .require<ContentSharesModuleDependencies>(CONTENT_SHARES_MODULE_DEPENDENCIES)
          .service.isShareable("FEATURE"),
      ).toBe(true);
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(featuresModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });
});
