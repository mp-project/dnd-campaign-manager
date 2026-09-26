import type { AppModule } from "#core/app/moduleSystem";
import type { AppContainer } from "#core/app/container";
import {
  registerModules,
} from "#core/app/moduleSystem";
import {
  registerApiPingRoute,
} from "#core/http/systemRoutes";
import { rulesetModule } from "#src/modules/ruleset/index";
import { usersModule } from "#src/modules/users/index";

export const systemModule: AppModule = {
  name: "system",
  dependencies: [],
  register: async (app) => {
    registerApiPingRoute(app);
  },
};

export const defaultAppModules: readonly AppModule[] = [
  systemModule,
  usersModule,
  rulesetModule,
];

export async function registerAppModules(
  app: Parameters<AppModule["register"]>[0],
  container: AppContainer,
  modules: readonly AppModule[] = defaultAppModules,
): Promise<void> {
  await registerModules(app, container, modules);
}

export { rulesetModule } from "#src/modules/ruleset/index";
export { usersModule } from "#src/modules/users/index";
