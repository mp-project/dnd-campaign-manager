import Fastify from "fastify";
import { z } from "zod";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
  contentSharesModule,
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

const quest = {
  assetType: "QUEST" as const,
  playerContentSchema: z.object({}),
  loadPlayerContent: async () => ({}),
};

describe("content-shares module dependency injection", () => {
  it("publishes its port, adds no history and shares nothing until a module allows it", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      const service = container.dependencies.get<ContentSharesModuleDependencies>(
        CONTENT_SHARES_MODULE_DEPENDENCIES,
      )?.service;

      expect(service).toBeDefined();
      expect(service?.isShareable("QUEST")).toBe(false);
      expect(contentSharesModule.dependencies).toEqual([
        "system",
        "auth",
        "campaigns",
        "campaign-memberships",
        "assets",
        "asset-links",
      ]);

      service?.registerShareableType(quest);

      expect(service?.isShareable("QUEST")).toBe(true);
      expect(() => service?.registerShareableType(quest)).toThrow(
        "already shareable",
      );
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(contentSharesModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });
});
