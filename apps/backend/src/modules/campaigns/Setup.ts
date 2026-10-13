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
import { CAMPAIGNS_HTTP_PREFIX } from "#src/modules/campaigns/config/CampaignsHttpConfig";
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
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { UpdateCampaignController } from "#src/modules/campaigns/http/controller/UpdateCampaignController";
import { DeleteCampaignController } from "#src/modules/campaigns/http/controller/DeleteCampaignController";
import { AdvanceCampaignTimeController } from "#src/modules/campaigns/http/controller/AdvanceCampaignTimeController";
import { CorrectCampaignTimeController } from "#src/modules/campaigns/http/controller/CorrectCampaignTimeController";
import { GetCampaignTimeHistoryController } from "#src/modules/campaigns/http/controller/GetCampaignTimeHistoryController";

export const CAMPAIGNS_MODULE_DEPENDENCIES = "campaigns.module.dependencies";

export type CampaignsModuleDependencies = {
  repository: CampaignsRepository;
  service: CampaignsService;
  useCases: {
    listCampaigns: ListCampaignsUseCase;
    getCampaignById: GetCampaignByIdUseCase;
    createCampaign: CreateCampaignUseCase;
    updateCampaign: UpdateCampaignUseCase;
    deleteCampaign: DeleteCampaignUseCase;
    advanceCampaignTime: AdvanceCampaignTimeUseCase;
    correctCampaignTime: CorrectCampaignTimeUseCase;
    getCampaignTimeHistory: GetCampaignTimeHistoryUseCase;
  };
};

async function registerCampaignsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "campaigns",
    campaignsPermissionDefinitions,
  );

  const rulesetDependencies =
    container.dependencies.get<RulesetModuleDependencies>(RULESET_MODULE_DEPENDENCIES);
  const usersDependencies =
    container.dependencies.get<UsersModuleDependencies>(USERS_MODULE_DEPENDENCIES);

  const getOneUserByUseCase = usersDependencies?.useCases.getOneUserBy;

  if (!getOneUserByUseCase) {
    throw new Error("Users module dependencies are missing");
  }

  const repository = new CampaignsRepository();
  const campaignUserService = new CampaignUserService(getOneUserByUseCase);
  const service = new CampaignsService(
    container.db,
    container.transactionManager,
    repository,
    container.ports.permissionService,
    rulesetDependencies,
    usersDependencies,
    campaignUserService,
  );

  const currentCampaignFactPort = container.ports.campaignFactPort;

  if (currentCampaignFactPort) {
    container.ports.campaignFactPort = {
      ...currentCampaignFactPort,
      resolveCampaignAccess: async ({ campaignId, actorId }) =>
        service.resolveCampaignAccess({ campaignId, actorId }),
    };
  }

  const listCampaignsUseCase = new ListCampaignsUseCase(service);
  const getCampaignByIdUseCase = new GetCampaignByIdUseCase(service);
  const createCampaignUseCase = new CreateCampaignUseCase(service);
  const updateCampaignUseCase = new UpdateCampaignUseCase(service);
  const deleteCampaignUseCase = new DeleteCampaignUseCase(service);
  const advanceCampaignTimeUseCase = new AdvanceCampaignTimeUseCase(service);
  const correctCampaignTimeUseCase = new CorrectCampaignTimeUseCase(service);
  const getCampaignTimeHistoryUseCase = new GetCampaignTimeHistoryUseCase(service);

  const moduleDependencies: CampaignsModuleDependencies = {
    repository,
    service,
    useCases: {
      listCampaigns: listCampaignsUseCase,
      getCampaignById: getCampaignByIdUseCase,
      createCampaign: createCampaignUseCase,
      updateCampaign: updateCampaignUseCase,
      deleteCampaign: deleteCampaignUseCase,
      advanceCampaignTime: advanceCampaignTimeUseCase,
      correctCampaignTime: correctCampaignTimeUseCase,
      getCampaignTimeHistory: getCampaignTimeHistoryUseCase,
    },
  };

  container.dependencies.set(CAMPAIGNS_MODULE_DEPENDENCIES, moduleDependencies);

  const listCampaignsController = new ListCampaignsController(listCampaignsUseCase);
  const getCampaignByIdController = new GetCampaignByIdController(
    getCampaignByIdUseCase,
    campaignUserService,
  );
  const createCampaignController = new CreateCampaignController(
    createCampaignUseCase,
    campaignUserService,
  );
  const updateCampaignController = new UpdateCampaignController(
    updateCampaignUseCase,
    campaignUserService,
  );
  const deleteCampaignController = new DeleteCampaignController(
    deleteCampaignUseCase,
    campaignUserService,
  );
  const advanceCampaignTimeController = new AdvanceCampaignTimeController(
    advanceCampaignTimeUseCase,
    campaignUserService,
  );
  const correctCampaignTimeController = new CorrectCampaignTimeController(
    correctCampaignTimeUseCase,
    campaignUserService,
  );
  const getCampaignTimeHistoryController = new GetCampaignTimeHistoryController(
    getCampaignTimeHistoryUseCase,
    campaignUserService,
  );

  app.register(
    async (campaignsApp) => {
      registerCampaignsRoutes(campaignsApp, {
        listCampaignsController,
        getCampaignByIdController,
        createCampaignController,
        updateCampaignController,
        deleteCampaignController,
        advanceCampaignTimeController,
        correctCampaignTimeController,
        getCampaignTimeHistoryController,
      });
    },
    { prefix: CAMPAIGNS_HTTP_PREFIX },
  );
}

export const campaignsModule: AppModule = {
  name: "campaigns",
  dependencies: ["system", "auth", "users", "ruleset"],
  register: registerCampaignsModule,
};
