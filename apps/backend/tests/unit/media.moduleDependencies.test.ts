import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import { registerAppModules } from "#src/modules/index";
import {
  MEDIA_MODULE_DEPENDENCIES,
  type MediaModuleDependencies,
  mediaModule,
} from "#src/modules/media/index";
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

describe("media module dependency injection", () => {
  it("publishes its port and declares what it depends on", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      expect(
        container.dependencies.get<MediaModuleDependencies>(MEDIA_MODULE_DEPENDENCIES)?.service,
      ).toBeDefined();
      expect(mediaModule.dependencies).toEqual(["system", "auth", "history", "campaigns", "assets"]);
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(mediaModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });
});
