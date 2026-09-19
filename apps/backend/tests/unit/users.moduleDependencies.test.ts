import Fastify from "fastify";

import { createAppContainer } from "#core/app/container";
import { createPgPool } from "#core/db/pool";
import {
  USERS_MODULE_DEPENDENCIES,
  type UsersModuleDependencies,
  usersModule,
} from "#src/modules/users/index";
import { createTestEnv } from "#test/helpers/testEnv";

describe("users module dependency injection", () => {
  it("registers module dependencies under the users token", async () => {
    const env = createTestEnv();
    const pool = createPgPool(env.DATABASE_URL);
    const container = createAppContainer({ config: env, pool });
    const app = Fastify();

    try {
      await usersModule.register(app, container);

      const dependencies = container.dependencies.get<UsersModuleDependencies>(
        USERS_MODULE_DEPENDENCIES,
      );

      expect(dependencies).toBeDefined();
    } finally {
      await app.close();
      await pool.end();
    }
  });
});
