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
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
} from "#src/modules/features/index";
import { FeatsRepository } from "#src/modules/feats/domain/repository/FeatsRepository";
import { FEAT_ASSET_ACTIONS } from "#src/modules/feats/history/TrackedFeat";
import {
  CheckFeatEligibilityController,
  CreateFeatController,
  DeleteFeatController,
  GetFeatCategoriesController,
  GetFeatController,
  GetFeatSectionController,
  ListCampaignFeatsController,
  ListFeatCatalogController,
  ListSystemFeatsController,
  ResolveFeatController,
  RestoreFeatController,
  UpdateFeatController,
  ValidateFeatController,
} from "#src/modules/feats/http/controller/FeatControllers";
import { registerFeatsRoutes } from "#src/modules/feats/http/routes/v1/FeatsRoutes";
import { featsPermissionDefinitions } from "#src/modules/feats/permissions/FeatsPermissions";
import { FeatSelectionService } from "#src/modules/feats/service/FeatSelectionService";
import { FeatsService } from "#src/modules/feats/service/FeatsService";
import { FeatReader } from "#src/modules/feats/useCase/FeatReader";
import {
  CheckFeatEligibilityUseCase,
  GetFeatCategoriesUseCase,
  GetFeatChoicesUseCase,
  GetFeatFeaturesUseCase,
  GetFeatPrerequisitesUseCase,
  GetFeatUsagesUseCase,
  GetFeatUseCase,
  ResolveFeatUseCase,
} from "#src/modules/feats/useCase/FeatReadUseCases";
import {
  CreateFeatUseCase,
  DeleteFeatUseCase,
  RestoreFeatUseCase,
  UpdateFeatUseCase,
  ValidateFeatUseCase,
} from "#src/modules/feats/useCase/FeatWriteUseCases";
import {
  FeatListing,
  ListCampaignFeatsUseCase,
  ListFeatCatalogUseCase,
  ListSystemFeatsUseCase,
} from "#src/modules/feats/useCase/ListFeatsUseCase";
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
} from "#src/modules/ruleset/index";

export const FEATS_MODULE_DEPENDENCIES = "feats.module.dependencies";

/**
 * Public port of the feats module. The character modules read feats through `service`
 * (`requireSelectableFeat`, `requireReadableFeat`) and check and resolve a character's feat
 * through `selection` (`checkEligibility`, `resolveFeat`), with the full view (`isVisible` always
 * true). They store which feats a character took, with its choices, themselves, in their own
 * transaction, and pass its handle as `db`.
 */
export type FeatsModuleDependencies = {
  service: FeatsService;
  selection: FeatSelectionService;
};

async function registerFeatsModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("feats", featsPermissionDefinitions);

  const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  const campaigns = container.dependencies.require<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES);
  const assetLinks = container.dependencies.require<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES);
  const features = container.dependencies.require<FeaturesModuleDependencies>(FEATURES_MODULE_DEPENDENCIES);
  const rulesets = container.dependencies.require<RulesetModuleDependencies>(RULESET_MODULE_DEPENDENCIES);
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new FeatsService(
    container.db,
    container.transactionManager,
    new FeatsRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
      findEditionYears: (rulesetIds, db) => rulesets.repository.listEditionYears(db, rulesetIds),
    },
  );
  const selection = new FeatSelectionService(assetsService, features.service);

  history.register(service.trackedFeat);
  // Custom features of a released feat become visible with it.
  assetsService.registerVisibilityProvider({
    name: "feat-features",
    listVisibleAssetIds: (input, db) => service.listReleasedFeatureIds(input, db),
  });
  // Custom feats reach players through a release, not through content shares.
  assetsService.registerContentType({
    assetType: "FEAT",
    kind: "RULE",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: FEAT_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
    properties: (asset, db) => service.listContentProperties(asset, db),
  });

  container.dependencies.set<FeatsModuleDependencies>(FEATS_MODULE_DEPENDENCIES, {
    service,
    selection,
  });

  const listing = new FeatListing(service, assetsService);
  const reader = new FeatReader(service, assetsService);

  app.register(async (featsApp) => {
    registerFeatsRoutes(featsApp, {
      listCampaignFeatsController: new ListCampaignFeatsController(new ListCampaignFeatsUseCase(listing)),
      listFeatCatalogController: new ListFeatCatalogController(new ListFeatCatalogUseCase(listing)),
      listSystemFeatsController: new ListSystemFeatsController(new ListSystemFeatsUseCase(listing)),
      getCampaignFeatController: new GetFeatController(new GetFeatUseCase(service, reader, "campaign")),
      getCatalogFeatController: new GetFeatController(new GetFeatUseCase(service, reader, "catalog")),
      getSystemFeatController: new GetFeatController(new GetFeatUseCase(service, reader, "system")),
      getFeatCategoriesController: new GetFeatCategoriesController(
        new GetFeatCategoriesUseCase(service, assetsService),
      ),
      getFeatPrerequisitesController: new GetFeatSectionController(new GetFeatPrerequisitesUseCase(reader)),
      getFeatChoicesController: new GetFeatSectionController(new GetFeatChoicesUseCase(reader)),
      getFeatFeaturesController: new GetFeatSectionController(new GetFeatFeaturesUseCase(reader)),
      getCampaignFeatUsagesController: new GetFeatSectionController(
        new GetFeatUsagesUseCase(reader, service, true),
      ),
      getCatalogFeatUsagesController: new GetFeatSectionController(
        new GetFeatUsagesUseCase(reader, service, false),
      ),
      checkFeatEligibilityController: new CheckFeatEligibilityController(
        new CheckFeatEligibilityUseCase(reader, selection),
      ),
      resolveFeatController: new ResolveFeatController(new ResolveFeatUseCase(reader, selection)),
      createFeatController: new CreateFeatController(new CreateFeatUseCase(history, service)),
      updateFeatController: new UpdateFeatController(new UpdateFeatUseCase(history, service)),
      deleteFeatController: new DeleteFeatController(new DeleteFeatUseCase(history, service)),
      restoreFeatController: new RestoreFeatController(new RestoreFeatUseCase(history, service)),
      validateFeatController: new ValidateFeatController(new ValidateFeatUseCase(service)),
    });
  });
}

export const featsModule: AppModule = {
  name: "feats",
  dependencies: [
    "system",
    "auth",
    "history",
    "ruleset",
    "campaigns",
    "assets",
    "asset-links",
    "features",
  ],
  register: registerFeatsModule,
};
