import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { AssetLinksRepository } from "#src/modules/asset-links/domain/repository/AssetLinksRepository";
import { CreateAssetLinkController } from "#src/modules/asset-links/http/controller/CreateAssetLinkController";
import { DeleteAssetLinkController } from "#src/modules/asset-links/http/controller/DeleteAssetLinkController";
import { GetAssetUsagesController } from "#src/modules/asset-links/http/controller/GetAssetUsagesController";
import { ListAssetLinksController } from "#src/modules/asset-links/http/controller/ListAssetLinksController";
import { UpdateAssetLinkController } from "#src/modules/asset-links/http/controller/UpdateAssetLinkController";
import { registerAssetLinksRoutes } from "#src/modules/asset-links/http/routes/v1/AssetLinksRoutes";
import { assetLinksPermissionDefinitions } from "#src/modules/asset-links/permissions/AssetLinksPermissions";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import {
  AssetRelationRegistry,
  RELATED_TO_RELATION,
} from "#src/modules/asset-links/service/AssetRelationRegistry";
import { CreateAssetLinkUseCase } from "#src/modules/asset-links/useCase/CreateAssetLinkUseCase";
import { DeleteAssetLinkUseCase } from "#src/modules/asset-links/useCase/DeleteAssetLinkUseCase";
import { GetAssetUsagesUseCase } from "#src/modules/asset-links/useCase/GetAssetUsagesUseCase";
import { ListAssetLinksUseCase } from "#src/modules/asset-links/useCase/ListAssetLinksUseCase";
import { UpdateAssetLinkUseCase } from "#src/modules/asset-links/useCase/UpdateAssetLinkUseCase";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";

export const ASSET_LINKS_MODULE_DEPENDENCIES = "asset-links.module.dependencies";

/**
 * Public port of the asset-links module. Domain modules register their relations
 * (`service.relations.register`), usage providers and edit routes, and use `createLink`,
 * `updateLink` and `removeLink` inside their own actions.
 */
export type AssetLinksModuleDependencies = {
  service: AssetLinksService;
};

async function registerAssetLinksModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "asset-links",
    assetLinksPermissionDefinitions,
  );

  const assetsDependencies = container.dependencies.get<AssetsModuleDependencies>(
    ASSETS_MODULE_DEPENDENCIES,
  );

  if (!assetsDependencies) {
    throw new Error("Assets module dependencies are missing");
  }

  const campaignsDependencies = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );

  if (!campaignsDependencies) {
    throw new Error("Campaigns module dependencies are missing");
  }

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assetsDependencies.service;
  const relations = new AssetRelationRegistry();

  relations.register(RELATED_TO_RELATION);

  const service = new AssetLinksService(
    container.db,
    container.transactionManager,
    new AssetLinksRepository(),
    relations,
    assetsService,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaignsDependencies.service.findCampaignRole(campaignId, actorId, db),
    },
    app.log,
  );

  history.register(service.trackedLink);

  assetsService.registerArchiveGuard({
    name: "asset-links",
    assertCanArchive: (asset, db) => service.assertNoBlockingUsages(asset, db),
  });

  container.dependencies.set<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES, {
    service,
  });

  const listAssetLinksUseCase = new ListAssetLinksUseCase(service, assetsService);
  const createAssetLinkUseCase = new CreateAssetLinkUseCase(history, service, assetsService);
  const updateAssetLinkUseCase = new UpdateAssetLinkUseCase(history, service, assetsService);
  const deleteAssetLinkUseCase = new DeleteAssetLinkUseCase(history, service, assetsService);
  const getAssetUsagesUseCase = new GetAssetUsagesUseCase(service, assetsService);

  app.register(async (assetLinksApp) => {
    registerAssetLinksRoutes(assetLinksApp, {
      listAssetLinksController: new ListAssetLinksController(listAssetLinksUseCase),
      createAssetLinkController: new CreateAssetLinkController(createAssetLinkUseCase),
      updateAssetLinkController: new UpdateAssetLinkController(updateAssetLinkUseCase),
      deleteAssetLinkController: new DeleteAssetLinkController(deleteAssetLinkUseCase),
      getAssetUsagesController: new GetAssetUsagesController(getAssetUsagesUseCase),
    });
  });
}

export const assetLinksModule: AppModule = {
  name: "asset-links",
  dependencies: ["system", "auth", "history", "campaigns", "assets"],
  register: registerAssetLinksModule,
};
