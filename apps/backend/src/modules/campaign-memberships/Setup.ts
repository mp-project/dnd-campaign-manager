import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import { registerCampaignMembershipRoutes } from "#src/modules/campaign-memberships/http/routes/v1/CampaignMembershipsRoutes";
import { CampaignMembershipsController } from "#src/modules/campaign-memberships/http/controller/CampaignMembershipsController";
import { campaignMembershipPermissionDefinitions } from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import {
  USERS_MODULE_DEPENDENCIES,
  type UsersModuleDependencies,
} from "#src/modules/users/index";

export const CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES = "campaignMemberships.module.dependencies";

export type CampaignMembershipsModuleDependencies = {
  repository: CampaignMembershipsRepository;
  service: CampaignMembershipsService;
};

async function registerCampaignMembershipsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "campaign-memberships",
    campaignMembershipPermissionDefinitions,
  );

  const campaignsDependencies = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );
  const usersDependencies = container.dependencies.get<UsersModuleDependencies>(
    USERS_MODULE_DEPENDENCIES,
  );
  if (!campaignsDependencies || !usersDependencies) {
    throw new Error("Campaign or users module dependencies are missing");
  }

  const repository = new CampaignMembershipsRepository();
  const service = new CampaignMembershipsService(
    container.db,
    container.transactionManager,
    repository,
    campaignsDependencies.service,
    usersDependencies,
  );

  const currentCampaignFactPort = container.ports.campaignFactPort;

  if (currentCampaignFactPort) {
    container.ports.campaignFactPort = {
      ...currentCampaignFactPort,
      resolveCampaignAccess: async ({ campaignId, actorId }) =>
        service.buildCampaignContext(campaignId, actorId),
    };
  }

  container.dependencies.set<CampaignMembershipsModuleDependencies>(
    CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES,
    { repository, service },
  );

  const controller = new CampaignMembershipsController(service);
  app.register(
    async (membershipApp) => {
      registerCampaignMembershipRoutes(membershipApp, controller);
    },
    { prefix: "/campaigns" },
  );
}

export const campaignMembershipsModule: AppModule = {
  name: "campaign-memberships",
  dependencies: ["system", "auth", "users", "campaigns"],
  register: registerCampaignMembershipsModule,
};
