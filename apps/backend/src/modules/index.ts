import type { AppModule } from "#core/app/moduleSystem";
import type { AppContainer } from "#core/app/container";
import {
  registerModules,
} from "#core/app/moduleSystem";
import {
  registerApiPingRoute,
} from "#core/http/systemRoutes";
import { authModule } from "#src/modules/auth/index";
import { rulesetModule } from "#src/modules/ruleset/index";
import { usersModule } from "#src/modules/users/index";
import { campaignsModule } from "#src/modules/campaigns/index";
import { campaignMembershipsModule } from "#src/modules/campaign-memberships/index";
import { campaignInvitationsModule } from "#src/modules/campaign-invitations/index";
import { assetsModule } from "#src/modules/assets/index";

export const systemModule: AppModule = {
  name: "system",
  dependencies: [],
  register: async (app) => {
    registerApiPingRoute(app);
  },
};

export const defaultAppModules: readonly AppModule[] = [
  systemModule,
  authModule,
  usersModule,
  rulesetModule,
  campaignsModule,
  campaignMembershipsModule,
  campaignInvitationsModule,
  assetsModule,
];

export async function registerAppModules(
  app: Parameters<AppModule["register"]>[0],
  container: AppContainer,
  modules: readonly AppModule[] = defaultAppModules,
): Promise<void> {
  await registerModules(app, container, modules);
}

export { assetsModule } from "#src/modules/assets/index";
export { authModule } from "#src/modules/auth/index";
export { campaignsModule } from "#src/modules/campaigns/index";
export { campaignMembershipsModule } from "#src/modules/campaign-memberships/index";
export { campaignInvitationsModule } from "#src/modules/campaign-invitations/index";
export { rulesetModule } from "#src/modules/ruleset/index";
export { usersModule } from "#src/modules/users/index";
