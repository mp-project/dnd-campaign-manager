import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { CampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/CampaignInvitationsController";
import {
  registerCampaignInvitationRoutes,
  registerUserInvitationRoutes,
} from "#src/modules/campaign-invitations/http/routes/v1/CampaignInvitationsRoutes";
import { campaignInvitationPermissionDefinitions } from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
import {
  CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES,
  type CampaignMembershipsModuleDependencies,
} from "#src/modules/campaign-memberships/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import {
  USERS_MODULE_DEPENDENCIES,
  type UsersModuleDependencies,
} from "#src/modules/users/index";

export const CAMPAIGN_INVITATIONS_MODULE_DEPENDENCIES = "campaignInvitations.module.dependencies";

export type CampaignInvitationsModuleDependencies = {
  repository: CampaignInvitationsRepository;
  service: CampaignInvitationsService;
};

async function registerCampaignInvitationsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "campaign-invitations",
    campaignInvitationPermissionDefinitions,
  );

  const campaignsDependencies = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );
  const membershipsDependencies = container.dependencies.get<CampaignMembershipsModuleDependencies>(
    CAMPAIGN_MEMBERSHIPS_MODULE_DEPENDENCIES,
  );
  const usersDependencies = container.dependencies.get<UsersModuleDependencies>(
    USERS_MODULE_DEPENDENCIES,
  );

  if (!campaignsDependencies || !membershipsDependencies || !usersDependencies) {
    throw new Error("Campaign, membership or users module dependencies are missing");
  }

  const repository = new CampaignInvitationsRepository();
  const service = new CampaignInvitationsService(
    container.db,
    container.transactionManager,
    repository,
    campaignsDependencies.service,
    membershipsDependencies.service,
    usersDependencies,
    container.ports.emailPort,
    container.config.FRONTEND_ORIGIN,
  );

  container.dependencies.set<CampaignInvitationsModuleDependencies>(
    CAMPAIGN_INVITATIONS_MODULE_DEPENDENCIES,
    { repository, service },
  );

  const controller = new CampaignInvitationsController(service);
  app.register(
    async (campaignInvitationApp) => {
      registerCampaignInvitationRoutes(campaignInvitationApp, controller);
    },
    { prefix: "/campaigns" },
  );
  registerUserInvitationRoutes(app, controller);
}

export const campaignInvitationsModule: AppModule = {
  name: "campaign-invitations",
  dependencies: ["system", "auth", "users", "campaigns", "campaign-memberships"],
  register: registerCampaignInvitationsModule,
};