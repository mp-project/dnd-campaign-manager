import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { registerApiBaseRoute } from "#core/http/systemRoutes";
import { registerAppModules } from "#src/modules/index";

export function registerApiRoutes(
  app: FastifyInstance,
  container: AppContainer,
  modules: readonly AppModule[],
  basePath: string,
): void {
  app.register(
    async (apiApp) => {
      registerApiBaseRoute(apiApp);
      await registerAppModules(apiApp, container, modules);
    },
    { prefix: basePath },
  );
}
