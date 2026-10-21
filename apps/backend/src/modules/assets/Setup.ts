import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import { AssetsRepository } from "#src/modules/assets/domain/repository/AssetsRepository";
import { registerAssetsRoutes } from "#src/modules/assets/http/routes/v1/AssetsRoutes";
import { assetsPermissionDefinitions } from "#src/modules/assets/permissions/AssetsPermissions";
import { AssetsService } from "#src/modules/assets/service/AssetsService";
import { ListCampaignAssetsUseCase } from "#src/modules/assets/useCase/ListCampaignAssetsUseCase";
import { GetAssetByIdUseCase } from "#src/modules/assets/useCase/GetAssetByIdUseCase";
import { ListCampaignCatalogUseCase } from "#src/modules/assets/useCase/ListCampaignCatalogUseCase";
import { ListCatalogUseCase } from "#src/modules/assets/useCase/ListCatalogUseCase";
import { UpdateAssetUseCase } from "#src/modules/assets/useCase/UpdateAssetUseCase";
import { DeleteAssetUseCase } from "#src/modules/assets/useCase/DeleteAssetUseCase";
import { RestoreAssetUseCase } from "#src/modules/assets/useCase/RestoreAssetUseCase";
import { ListCampaignAssetsController } from "#src/modules/assets/http/controller/ListCampaignAssetsController";
import { GetAssetByIdController } from "#src/modules/assets/http/controller/GetAssetByIdController";
import { ListCampaignCatalogController } from "#src/modules/assets/http/controller/ListCampaignCatalogController";
import { ListCatalogController } from "#src/modules/assets/http/controller/ListCatalogController";
import { UpdateAssetController } from "#src/modules/assets/http/controller/UpdateAssetController";
import { DeleteAssetController } from "#src/modules/assets/http/controller/DeleteAssetController";
import { RestoreAssetController } from "#src/modules/assets/http/controller/RestoreAssetController";

export const ASSETS_MODULE_DEPENDENCIES = "assets.module.dependencies";

/**
 * Public port of the assets module. Domain modules use `service` (createBase, updateMetadata,
 * archiveBase, restoreBase, get, assertAvailable, assertSameCampaign, resolveVariant) inside
 * their own transactions and may register visibility providers.
 */
export type AssetsModuleDependencies = {
  service: AssetsService;
  useCases: {
    listCampaignAssets: ListCampaignAssetsUseCase;
    getAssetById: GetAssetByIdUseCase;
    listCampaignCatalog: ListCampaignCatalogUseCase;
    listCatalog: ListCatalogUseCase;
  };
};

async function registerAssetsModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "assets",
    assetsPermissionDefinitions,
  );

  const campaignsDependencies = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );

  if (!campaignsDependencies) {
    throw new Error("Campaigns module dependencies are missing");
  }

  const repository = new AssetsRepository();
  const service = new AssetsService(
    container.db,
    container.transactionManager,
    repository,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaignsDependencies.service.findCampaignRole(campaignId, actorId, db),
    },
  );

  const listCampaignAssetsUseCase = new ListCampaignAssetsUseCase(service);
  const getAssetByIdUseCase = new GetAssetByIdUseCase(service);
  const listCampaignCatalogUseCase = new ListCampaignCatalogUseCase(service);
  const listCatalogUseCase = new ListCatalogUseCase(service);
  const updateAssetUseCase = new UpdateAssetUseCase(service);
  const deleteAssetUseCase = new DeleteAssetUseCase(service);
  const restoreAssetUseCase = new RestoreAssetUseCase(service);

  container.dependencies.set<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES, {
    service,
    useCases: {
      listCampaignAssets: listCampaignAssetsUseCase,
      getAssetById: getAssetByIdUseCase,
      listCampaignCatalog: listCampaignCatalogUseCase,
      listCatalog: listCatalogUseCase,
    },
  });

  app.register(async (assetsApp) => {
    registerAssetsRoutes(assetsApp, {
      listCampaignAssetsController: new ListCampaignAssetsController(listCampaignAssetsUseCase),
      getAssetByIdController: new GetAssetByIdController(getAssetByIdUseCase),
      listCampaignCatalogController: new ListCampaignCatalogController(
        listCampaignCatalogUseCase,
      ),
      listCatalogController: new ListCatalogController(listCatalogUseCase),
      updateAssetController: new UpdateAssetController(
        updateAssetUseCase,
      ),
      deleteAssetController: new DeleteAssetController(deleteAssetUseCase),
      restoreAssetController: new RestoreAssetController(restoreAssetUseCase),
    });
  });
}

export const assetsModule: AppModule = {
  name: "assets",
  dependencies: ["system", "auth", "ruleset", "campaigns"],
  register: registerAssetsModule,
};
