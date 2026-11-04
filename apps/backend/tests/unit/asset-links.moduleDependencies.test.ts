import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
  assetLinksModule,
} from "#src/modules/asset-links/index";
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

describe("asset-links module dependency injection", () => {
  it("publishes its port and declares what it depends on", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const dependencies = container.dependencies.get<AssetLinksModuleDependencies>(
        ASSET_LINKS_MODULE_DEPENDENCIES,
      );

      expect(dependencies?.service.relations.find("RELATED_TO")).toBeDefined();
      expect(assetLinksModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
      ]);
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(assetLinksModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });

  it("every registered relation has a type the API accepts and strict metadata", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const { service } = container.dependencies.require<AssetLinksModuleDependencies>(
        ASSET_LINKS_MODULE_DEPENDENCIES,
      );

      for (const relation of service.relations.list()) {
        expect(relation.type).toMatch(/^[A-Z][A-Z0-9_]*$/);
        expect(
          relation.metadataSchema.safeParse({ notPartOfTheRelation: true }).success,
        ).toBe(false);
      }
    });
  });
});
