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
  SPELLS_MODULE_DEPENDENCIES,
  type SpellsModuleDependencies,
  spellsModule,
} from "#src/modules/spells/index";
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

describe("spells module dependency injection", () => {
  it("publishes its port, tracks spells and lists as children of assets and makes them releasable, not shareable", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const port = container.dependencies.get<SpellsModuleDependencies>(SPELLS_MODULE_DEPENDENCIES);

      expect(port?.service).toBeDefined();
      expect(spellsModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "classes",
      ]);

      const entities = container.ports.history?.listEntities() ?? [];

      for (const type of ["spell", "spellList"]) {
        const tracked = entities.find((item) => item.type === type);

        expect(tracked?.table).toBeDefined();
        expect(tracked?.root?.({ assetId: "a" } as never)).toEqual({ type: "asset", id: "a" });
      }

      const assets = container.dependencies.require<AssetsModuleDependencies>(
        ASSETS_MODULE_DEPENDENCIES,
      ).service;
      const shares = container.dependencies.require<ContentSharesModuleDependencies>(
        CONTENT_SHARES_MODULE_DEPENDENCIES,
      ).service;

      for (const assetType of ["SPELL", "SPELL_LIST"] as const) {
        expect(assets.isReleasable(assetType)).toBe(true);
        expect(shares.isShareable(assetType)).toBe(false);
      }
    });
  });

  it("fails fast when the classes module is not registered", async () => {
    await withContainer(async (app, container) => {
      container.dependencies.set(ASSETS_MODULE_DEPENDENCIES, {} as never);
      container.dependencies.set("campaigns.module.dependencies", {} as never);
      container.dependencies.set("asset-links.module.dependencies", {} as never);

      await expect(spellsModule.register(app, container)).rejects.toThrow(
        "Missing dependency registration for 'classes.module.dependencies'",
      );
    });
  });
});
