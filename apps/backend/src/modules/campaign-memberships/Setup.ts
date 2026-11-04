import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { CampaignMembershipsRepository } from "#src/modules/campaign-memberships/domain/repository/CampaignMembershipsRepository";
import { registerCampaignMembershipsRoutes } from "#src/modules/campaign-memberships/http/routes/v1/CampaignMembershipsRoutes";
import { ListCampaignMembersController } from "#src/modules/campaign-memberships/http/controller/ListCampaignMembersController";
import { UpdateCampaignMemberController } from "#src/modules/campaign-memberships/http/controller/UpdateCampaignMemberController";
import { DeleteCampaignMemberController } from "#src/modules/campaign-memberships/http/controller/DeleteCampaignMemberController";
import { GetMyCampaignPermissionsController } from "#src/modules/campaign-memberships/http/controller/GetMyCampaignPermissionsController";
import { campaignMembershipPermissionDefinitions } from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import { ListCampaignMembersUseCase } from "#src/modules/campaign-memberships/useCase/ListCampaignMembersUseCase";
import { UpdateCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/UpdateCampaignMemberUseCase";
import { DeleteCampaignMemberUseCase } from "#src/modules/campaign-memberships/useCase/DeleteCampaignMemberUseCase";
import { GetMyCampaignPermissionsUseCase } from "#src/modules/campaign-memberships/useCase/GetMyCampaignPermissionsUseCase";
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

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
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

  app.register(async (campaignMembershipsApp) => {
    registerCampaignMembershipsRoutes(campaignMembershipsApp, {
      listCampaignMembersController: new ListCampaignMembersController(
        new ListCampaignMembersUseCase(service),
      ),
      updateCampaignMemberController: new UpdateCampaignMemberController(
        new UpdateCampaignMemberUseCase(history, service),
      ),
      deleteCampaignMemberController: new DeleteCampaignMemberController(
        new DeleteCampaignMemberUseCase(history, service),
      ),
      getMyCampaignPermissionsController: new GetMyCampaignPermissionsController(
        new GetMyCampaignPermissionsUseCase(service),
      ),
    });
  });
}

export const campaignMembershipsModule: AppModule = {
  name: "campaign-memberships",
  dependencies: ["system", "auth", "history", "users", "campaigns"],
  register: registerCampaignMembershipsModule,
};
