import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  BACKGROUNDS_MODULE_DEPENDENCIES,
  type BackgroundsModuleDependencies,
  backgroundsModule,
} from "#src/modules/backgrounds/index";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/index";
import { registerAppModules } from "#src/modules/index";
import { createTestEnv } from "#test/helpers/testEnv";

async function withContainer(
  work: (app: ReturnType<typeof Fastify>, container: ReturnType<typeof createAppContainer>) => Promise<void>,
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

describe("backgrounds module dependency injection", () => {
  it("publishes its port, tracks backgrounds as children of assets and makes them releasable, not shareable", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const port = container.dependencies.get<BackgroundsModuleDependencies>(BACKGROUNDS_MODULE_DEPENDENCIES);

      expect(port?.service).toBeDefined();
      expect(port?.selection).toBeDefined();
      expect(backgroundsModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "ruleset",
        "campaigns",
        "assets",
        "asset-links",
        "features",
        "feats",
        "items",
      ]);

      const tracked = (container.ports.history?.listEntities() ?? []).find((item) => item.type === "background");

      expect(tracked?.table).toBeDefined();
      expect(tracked?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });

      const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES).service;
      const shares = container.dependencies.require<ContentSharesModuleDependencies>(
        CONTENT_SHARES_MODULE_DEPENDENCIES,
      ).service;

      expect(assets.isReleasable("BACKGROUND")).toBe(true);
      expect(shares.isShareable("BACKGROUND")).toBe(false);
      // Feats and items report what they are, so a background's rules hold when they change.
      expect(assets.getContentType("FEAT")?.properties).toBeDefined();
      expect(assets.getContentType("ITEM")?.properties).toBeDefined();
    });
  });

  it("fails fast when the feats module is not registered", async () => {
    await withContainer(async (app, container) => {
      container.dependencies.set(ASSETS_MODULE_DEPENDENCIES, {} as never);
      container.dependencies.set("campaigns.module.dependencies", {} as never);
      container.dependencies.set("asset-links.module.dependencies", {} as never);
      container.dependencies.set("features.module.dependencies", {} as never);

      await expect(backgroundsModule.register(app, container)).rejects.toThrow(
        "Missing dependency registration for 'feats.module.dependencies'",
      );
    });
  });
});
