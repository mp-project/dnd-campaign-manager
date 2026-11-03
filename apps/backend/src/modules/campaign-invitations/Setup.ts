import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
import { registerCampaignInvitationsRoutes } from "#src/modules/campaign-invitations/http/routes/v1/CampaignInvitationsRoutes";
import { campaignInvitationPermissionDefinitions } from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
import { CreateCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/CreateCampaignInvitationUseCase";
import { ListCampaignInvitationsUseCase } from "#src/modules/campaign-invitations/useCase/ListCampaignInvitationsUseCase";
import { LookupCampaignInvitationTargetUseCase } from "#src/modules/campaign-invitations/useCase/LookupCampaignInvitationTargetUseCase";
import { DeleteCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/DeleteCampaignInvitationUseCase";
import { AcceptCampaignInvitationUseCase } from "#src/modules/campaign-invitations/useCase/AcceptCampaignInvitationUseCase";
import { ListMyCampaignInvitationsUseCase } from "#src/modules/campaign-invitations/useCase/ListMyCampaignInvitationsUseCase";
import { CreateCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/CreateCampaignInvitationController";
import { ListCampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/ListCampaignInvitationsController";
import { LookupCampaignInvitationTargetController } from "#src/modules/campaign-invitations/http/controller/LookupCampaignInvitationTargetController";
import { DeleteCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/DeleteCampaignInvitationController";
import { AcceptCampaignInvitationController } from "#src/modules/campaign-invitations/http/controller/AcceptCampaignInvitationController";
import { ListMyCampaignInvitationsController } from "#src/modules/campaign-invitations/http/controller/ListMyCampaignInvitationsController";
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

  app.register(async (campaignInvitationsApp) => {
    registerCampaignInvitationsRoutes(campaignInvitationsApp, {
      createCampaignInvitationController: new CreateCampaignInvitationController(
        new CreateCampaignInvitationUseCase(service),
      ),
      listCampaignInvitationsController: new ListCampaignInvitationsController(
        new ListCampaignInvitationsUseCase(service),
      ),
      lookupCampaignInvitationTargetController: new LookupCampaignInvitationTargetController(
        new LookupCampaignInvitationTargetUseCase(service),
      ),
      deleteCampaignInvitationController: new DeleteCampaignInvitationController(
        new DeleteCampaignInvitationUseCase(service),
      ),
      acceptCampaignInvitationController: new AcceptCampaignInvitationController(
        new AcceptCampaignInvitationUseCase(service),
      ),
      listMyCampaignInvitationsController: new ListMyCampaignInvitationsController(
        new ListMyCampaignInvitationsUseCase(service),
      ),
    });
  });
}

export const campaignInvitationsModule: AppModule = {
  name: "campaign-invitations",
  dependencies: ["system", "auth", "users", "campaigns", "campaign-memberships"],
  register: registerCampaignInvitationsModule,
};