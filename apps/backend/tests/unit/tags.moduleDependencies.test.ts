import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import { registerAppModules } from "#src/modules/index";
import {
  TAGS_MODULE_DEPENDENCIES,
  type TagsModuleDependencies,
  tagsModule,
} from "#src/modules/tags/index";
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

describe("tags module dependency injection", () => {
  it("publishes its port and adds the assignments to the tracked asset", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      expect(
        container.dependencies.get<TagsModuleDependencies>(TAGS_MODULE_DEPENDENCIES)?.service,
      ).toBeDefined();
      expect(tagsModule.dependencies).toEqual(["system", "auth", "history", "campaigns", "assets"]);

      const asset = container.ports.history?.listEntities().find((item) => item.type === "asset");

      expect(asset?.lists?.tagIds?.kind).toBe("list");
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(tagsModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });
});
