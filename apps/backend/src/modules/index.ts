import type { AppModule } from "#core/app/moduleSystem";
import { registerApiPingRoute } from "#core/http/systemRoutes";
import { rulesetModule } from "#src/modules/ruleset/index";
import { usersModule } from "#src/modules/users/index";

const systemModule: AppModule = {
  name: "system",
  dependencies: [],
  register: async (app) => {
    registerApiPingRoute(app);
  },
};

export const appModules: readonly AppModule[] = [
  systemModule,
  usersModule,
  rulesetModule,
];

export { rulesetModule } from "#src/modules/ruleset/index";
export { usersModule } from "#src/modules/users/index";
