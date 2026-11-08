import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/index";
import { registerAppModules } from "#src/modules/index";
import {
  NOTES_MODULE_DEPENDENCIES,
  type NotesModuleDependencies,
  notesModule,
} from "#src/modules/notes/index";
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

describe("notes module dependency injection", () => {
  it("publishes its port, tracks notes as children of assets and makes notes shareable", async () => {
    await withContainer(async (app, container) => {
      await registerAppModules(app, container);

      expect(
        container.dependencies.get<NotesModuleDependencies>(NOTES_MODULE_DEPENDENCIES)?.service,
      ).toBeDefined();
      expect(notesModule.dependencies).toEqual([
        "system",
        "auth",
        "history",
        "campaigns",
        "assets",
        "asset-links",
        "tags",
      ]);

      const note = container.ports.history?.listEntities().find((item) => item.type === "note");

      expect(note?.table).toBeDefined();
      expect(
        container.dependencies
          .require<ContentSharesModuleDependencies>(CONTENT_SHARES_MODULE_DEPENDENCIES)
          .service.isShareable("NOTE"),
      ).toBe(true);
    });
  });

  it("fails fast when the assets module is not registered", async () => {
    await withContainer(async (app, container) => {
      await expect(notesModule.register(app, container)).rejects.toThrow(
        "Assets module dependencies are missing",
      );
    });
  });
});
