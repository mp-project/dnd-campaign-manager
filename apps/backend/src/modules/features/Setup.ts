import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import { FeaturesRepository } from "#src/modules/features/domain/repository/FeaturesRepository";
import { FEATURE_ASSET_ACTIONS } from "#src/modules/features/history/TrackedFeature";
import { CreateFeatureController } from "#src/modules/features/http/controller/CreateFeatureController";
import { DeleteFeatureController } from "#src/modules/features/http/controller/DeleteFeatureController";
import { GetFeatureController } from "#src/modules/features/http/controller/GetFeatureController";
import { GetFeatureUsagesController } from "#src/modules/features/http/controller/GetFeatureUsagesController";
import {
  ListCampaignFeaturesController,
  ListFeatureCatalogController,
  ListSystemFeaturesController,
} from "#src/modules/features/http/controller/ListFeaturesControllers";
import { ResolveFeatureController } from "#src/modules/features/http/controller/ResolveFeatureController";
import { RestoreFeatureController } from "#src/modules/features/http/controller/RestoreFeatureController";
import { UpdateFeatureController } from "#src/modules/features/http/controller/UpdateFeatureController";
import { ValidateFeatureController } from "#src/modules/features/http/controller/ValidateFeatureController";
import { registerFeaturesRoutes } from "#src/modules/features/http/routes/v1/FeaturesRoutes";
import { featuresPermissionDefinitions } from "#src/modules/features/permissions/FeaturesPermissions";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";
import { CreateFeatureUseCase } from "#src/modules/features/useCase/CreateFeatureUseCase";
import { DeleteFeatureUseCase } from "#src/modules/features/useCase/DeleteFeatureUseCase";
import { GetFeatureUseCase } from "#src/modules/features/useCase/GetFeatureUseCase";
import { GetFeatureUsagesUseCase } from "#src/modules/features/useCase/GetFeatureUsagesUseCase";
import {
  FeatureListing,
  ListCampaignFeaturesUseCase,
  ListFeatureCatalogUseCase,
  ListSystemFeaturesUseCase,
} from "#src/modules/features/useCase/ListFeaturesUseCase";
import { ResolveFeatureUseCase } from "#src/modules/features/useCase/ResolveFeatureUseCase";
import { RestoreFeatureUseCase } from "#src/modules/features/useCase/RestoreFeatureUseCase";
import { UpdateFeatureUseCase } from "#src/modules/features/useCase/UpdateFeatureUseCase";
import { ValidateFeatureUseCase } from "#src/modules/features/useCase/ValidateFeatureUseCase";

export const FEATURES_MODULE_DEPENDENCIES = "features.module.dependencies";

/**
 * Public port of the features module. Source modules (classes, species, feats, items, monsters)
 * read and resolve features through `service` (`resolveFeature`, `evaluateEffects`) and store
 * grants and bindings themselves.
 */
export type FeaturesModuleDependencies = {
  service: FeaturesService;
};

async function registerFeaturesModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions("features", featuresPermissionDefinitions);

  const assets = container.dependencies.get<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);

  if (!assets) {
    throw new Error("Assets module dependencies are missing");
  }

  const campaigns = container.dependencies.get<CampaignsModuleDependencies>(
    CAMPAIGNS_MODULE_DEPENDENCIES,
  );

  if (!campaigns) {
    throw new Error("Campaigns module dependencies are missing");
  }

  const assetLinks = container.dependencies.get<AssetLinksModuleDependencies>(
    ASSET_LINKS_MODULE_DEPENDENCIES,
  );

  if (!assetLinks) {
    throw new Error("Asset links module dependencies are missing");
  }

  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new FeaturesService(
    container.db,
    container.transactionManager,
    new FeaturesRepository(),
    assetsService,
    assetLinks.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
    },
  );

  history.register(service.trackedFeature);
  // Cached resolutions of a changed feature are no longer needed.
  history.subscribe("*", (event) => service.onHistoryEvent(event));
  assetsService.allowCampaignRevert(FEATURE_ASSET_ACTIONS);
  // Custom features reach players through a release, not through content shares.
  assetsService.registerReleasableType("FEATURE");
  // Archived features keep nothing from being archived, so coming back needs the check again.
  assetsService.registerContentType({
    assetType: "FEATURE",
    references: (asset, db) => service.listContentReferences(asset, db),
    properties: (asset, db) => service.listContentProperties(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });
  assetLinks.service.registerEditRoute("FEATURE", (input, db) =>
    service.findEditRoutes(input, db),
  );

  container.dependencies.set<FeaturesModuleDependencies>(FEATURES_MODULE_DEPENDENCIES, {
    service,
  });

  const listing = new FeatureListing(service, assetsService);

  app.register(async (featuresApp) => {
    registerFeaturesRoutes(featuresApp, {
      listCampaignFeaturesController: new ListCampaignFeaturesController(
        new ListCampaignFeaturesUseCase(listing),
      ),
      listFeatureCatalogController: new ListFeatureCatalogController(
        new ListFeatureCatalogUseCase(listing),
      ),
      listSystemFeaturesController: new ListSystemFeaturesController(
        new ListSystemFeaturesUseCase(listing),
      ),
      getCampaignFeatureController: new GetFeatureController(
        new GetFeatureUseCase(service, assetsService, "campaign"),
      ),
      getCatalogFeatureController: new GetFeatureController(
        new GetFeatureUseCase(service, assetsService, "catalog"),
      ),
      getSystemFeatureController: new GetFeatureController(
        new GetFeatureUseCase(service, assetsService, "system"),
      ),
      createFeatureController: new CreateFeatureController(
        new CreateFeatureUseCase(history, service),
      ),
      updateFeatureController: new UpdateFeatureController(
        new UpdateFeatureUseCase(history, service),
      ),
      deleteFeatureController: new DeleteFeatureController(
        new DeleteFeatureUseCase(history, service),
      ),
      restoreFeatureController: new RestoreFeatureController(
        new RestoreFeatureUseCase(history, service),
      ),
      validateFeatureController: new ValidateFeatureController(
        new ValidateFeatureUseCase(service),
      ),
      getFeatureUsagesController: new GetFeatureUsagesController(
        new GetFeatureUsagesUseCase(service, assetsService),
      ),
      resolveFeatureController: new ResolveFeatureController(
        new ResolveFeatureUseCase(service, assetsService),
      ),
    });
  });
}

export const featuresModule: AppModule = {
  name: "features",
  dependencies: [
    "system",
    "auth",
    "history",
    "campaigns",
    "assets",
    "asset-links",
  ],
  register: registerFeaturesModule,
};
