import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
} from "#src/modules/ruleset/index";
import {
  USERS_MODULE_DEPENDENCIES,
  type UsersModuleDependencies,
} from "#src/modules/users/index";
import { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { registerCampaignsRoutes } from "#src/modules/campaigns/http/routes/v1/CampaignsRoutes";
import { campaignsPermissionDefinitions } from "#src/modules/campaigns/permissions/CampaignsPermissions";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
import { ListCampaignsUseCase } from "#src/modules/campaigns/useCase/ListCampaignsUseCase";
import { GetCampaignByIdUseCase } from "#src/modules/campaigns/useCase/GetCampaignByIdUseCase";
import { CreateCampaignUseCase } from "#src/modules/campaigns/useCase/CreateCampaignUseCase";
import { UpdateCampaignUseCase } from "#src/modules/campaigns/useCase/UpdateCampaignUseCase";
import { DeleteCampaignUseCase } from "#src/modules/campaigns/useCase/DeleteCampaignUseCase";
import { AdvanceCampaignTimeUseCase } from "#src/modules/campaigns/useCase/AdvanceCampaignTimeUseCase";
import { CorrectCampaignTimeUseCase } from "#src/modules/campaigns/useCase/CorrectCampaignTimeUseCase";
import { GetCampaignTimeHistoryUseCase } from "#src/modules/campaigns/useCase/GetCampaignTimeHistoryUseCase";
import { ListCampaignsController } from "#src/modules/campaigns/http/controller/ListCampaignsController";
import { GetCampaignByIdController } from "#src/modules/campaigns/http/controller/GetCampaignByIdController";
import { CreateCampaignController } from "#src/modules/campaigns/http/controller/CreateCampaignController";
import { UpdateCampaignController } from "#src/modules/campaigns/http/controller/UpdateCampaignController";
import { DeleteCampaignController } from "#src/modules/campaigns/http/controller/DeleteCampaignController";
import { AdvanceCampaignTimeController } from "#src/modules/campaigns/http/controller/AdvanceCampaignTimeController";
import { CorrectCampaignTimeController } from "#src/modules/campaigns/http/controller/CorrectCampaignTimeController";
import { GetCampaignTimeHistoryController } from "#src/modules/campaigns/http/controller/GetCampaignTimeHistoryController";

export const CAMPAIGNS_MODULE_DEPENDENCIES = "campaigns.module.dependencies";

export type CampaignsModuleDependencies = {
  repository: CampaignsRepository;
  service: CampaignsService;
};

async function registerCampaignsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "campaigns",
    campaignsPermissionDefinitions,
  );

  const repository = new CampaignsRepository();
  const service = new CampaignsService(
    container.db,
    container.transactionManager,
    repository,
    container.dependencies.require<UsersModuleDependencies>(USERS_MODULE_DEPENDENCIES),
    container.dependencies.require<RulesetModuleDependencies>(RULESET_MODULE_DEPENDENCIES),
    container.ports.permissionService,
  );

  const currentCampaignFactPort = container.ports.campaignFactPort;

  if (currentCampaignFactPort) {
    container.ports.campaignFactPort = {
      ...currentCampaignFactPort,
      resolveCampaignAccess: async ({ campaignId, actorId }) =>
        service.resolveCampaignAccess({ campaignId, actorId }),
    };
  }

  container.dependencies.set<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES, {
    repository,
    service,
  });

  app.register(async (campaignsApp) => {
    registerCampaignsRoutes(campaignsApp, {
      listCampaignsController: new ListCampaignsController(new ListCampaignsUseCase(service)),
      getCampaignByIdController: new GetCampaignByIdController(
        new GetCampaignByIdUseCase(service),
      ),
      createCampaignController: new CreateCampaignController(new CreateCampaignUseCase(service)),
      updateCampaignController: new UpdateCampaignController(new UpdateCampaignUseCase(service)),
      deleteCampaignController: new DeleteCampaignController(new DeleteCampaignUseCase(service)),
      advanceCampaignTimeController: new AdvanceCampaignTimeController(
        new AdvanceCampaignTimeUseCase(service),
      ),
      correctCampaignTimeController: new CorrectCampaignTimeController(
        new CorrectCampaignTimeUseCase(service),
      ),
      getCampaignTimeHistoryController: new GetCampaignTimeHistoryController(
        new GetCampaignTimeHistoryUseCase(service),
      ),
    });
  });
}

export const campaignsModule: AppModule = {
  name: "campaigns",
  dependencies: ["system", "auth", "users", "ruleset"],
  register: registerCampaignsModule,
};
