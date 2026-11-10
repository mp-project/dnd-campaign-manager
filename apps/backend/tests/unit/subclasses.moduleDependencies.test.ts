import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/index";
import { registerAppModules } from "#src/modules/index";
import {
  SUBCLASSES_MODULE_DEPENDENCIES,
  type SubclassesModuleDependencies,
  subclassesModule,
} from "#src/modules/subclasses/index";
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

describe("subclasses module dependency injection", () => {
  it("publishes its port, tracks subclasses as children of assets and makes them releasable, not shareable", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      expect(
        container.dependencies.get<SubclassesModuleDependencies>(SUBCLASSES_MODULE_DEPENDENCIES)
          ?.service,
      ).toBeDefined();
      expect(subclassesModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "features",
        "classes",
      ]);

      const tracked = container.ports.history
        ?.listEntities()
        .find((item) => item.type === "subclass");

      expect(tracked?.table).toBeDefined();
      expect(tracked?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });

      const assets = container.dependencies.require<AssetsModuleDependencies>(
        ASSETS_MODULE_DEPENDENCIES,
      ).service;

      expect(assets.isReleasable("SUBCLASS")).toBe(true);
      expect(assets.getContentType("SUBCLASS")?.verify).toBeDefined();
      expect(
        container.dependencies
          .require<ContentSharesModuleDependencies>(CONTENT_SHARES_MODULE_DEPENDENCIES)
          .service.isShareable("SUBCLASS"),
      ).toBe(false);
    });
  });

  it("fails fast when the classes module is not registered", async () => {
    await withContainer(async (app, container) => {
      container.dependencies.set(ASSETS_MODULE_DEPENDENCIES, {} as never);
      container.dependencies.set("campaigns.module.dependencies", {} as never);
      container.dependencies.set("asset-links.module.dependencies", {} as never);
      container.dependencies.set("features.module.dependencies", {} as never);

      await expect(subclassesModule.register(app, container)).rejects.toThrow(
        "Classes module dependencies are missing",
      );
    });
  });
});
