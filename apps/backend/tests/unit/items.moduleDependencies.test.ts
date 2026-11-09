import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import { ASSETS_MODULE_DEPENDENCIES, type AssetsModuleDependencies } from "#src/modules/assets/index";
import { registerAppModules } from "#src/modules/index";
import { ITEMS_MODULE_DEPENDENCIES, type ItemsModuleDependencies, itemsModule } from "#src/modules/items/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("items module dependency injection", () => {
  it("publishes its port, tracks items, instances and knowledge and makes items releasable", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await registerAppModules(app, container);

      const port = container.dependencies.get<ItemsModuleDependencies>(ITEMS_MODULE_DEPENDENCIES);

      expect(port?.service).toBeDefined();
      expect(port?.instances).toBeDefined();
      expect(itemsModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "features",
        "spells",
      ]);

      const entities = container.ports.history?.listEntities() ?? [];
      const item = entities.find((entity) => entity.type === "item");

      expect(item?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });
      expect(entities.some((entity) => entity.type === "itemInstance")).toBe(true);
      expect(entities.some((entity) => entity.type === "itemInstanceKnowledge")).toBe(true);

      const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);

      expect(assets.service.isReleasable("ITEM")).toBe(true);
      expect(assets.service.getContentType("ITEM")?.kind).toBe("RULE");
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
