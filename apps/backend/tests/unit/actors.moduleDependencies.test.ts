import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  ACTORS_MODULE_DEPENDENCIES,
  type ActorsModuleDependencies,
  actorsModule,
} from "#src/modules/actors/index";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
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

describe("actors module dependency injection", () => {
  it("publishes its port, tracks actors as children of assets and makes them shareable story content", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const port = container.dependencies.get<ActorsModuleDependencies>(ACTORS_MODULE_DEPENDENCIES);

      expect(port?.service).toBeDefined();
      expect(actorsModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "tags",
        "items",
      ]);

      const tracked = (container.ports.history?.listEntities() ?? []).find((item) => item.type === "actor");

      expect(tracked?.table).toBeDefined();
      expect(tracked?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });

      const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES).service;
      const shares = container.dependencies.require<ContentSharesModuleDependencies>(
        CONTENT_SHARES_MODULE_DEPENDENCIES,
      ).service;
      const links = container.dependencies.require<AssetLinksModuleDependencies>(
        ASSET_LINKS_MODULE_DEPENDENCIES,
      ).service;

      expect(assets.getContentType("ACTOR")).toMatchObject({ kind: "STORY", usesContent: true });
      expect(assets.isReleasable("ACTOR")).toBe(false);
      expect(shares.isShareable("ACTOR")).toBe(true);
      // Placeholder until factions have their own module.
      expect(links.relations.find("MEMBER_OF")).toMatchObject({ sourceTypes: ["ACTOR"], targetTypes: ["FACTION"] });
    });
  });

  it("fails fast when the items module is not registered", async () => {
    await withContainer(async (app, container) => {
      container.dependencies.set(ASSETS_MODULE_DEPENDENCIES, {} as never);
      container.dependencies.set("campaigns.module.dependencies", {} as never);
      container.dependencies.set("tags.module.dependencies", {} as never);
      container.dependencies.set("asset-links.module.dependencies", {} as never);

      await expect(actorsModule.register(app, container)).rejects.toThrow(
        "Missing dependency registration for 'items.module.dependencies'",
      );
    });
  });
});
