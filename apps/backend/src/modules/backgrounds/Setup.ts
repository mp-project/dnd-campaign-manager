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
  BACKGROUND_SECTIONS,
  type BackgroundSection,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import { BackgroundsRepository } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import { BACKGROUND_ASSET_ACTIONS } from "#src/modules/backgrounds/history/TrackedBackground";
import { CreateBackgroundController } from "#src/modules/backgrounds/http/controller/CreateBackgroundController";
import { DeleteBackgroundController } from "#src/modules/backgrounds/http/controller/DeleteBackgroundController";
import { GetBackgroundController } from "#src/modules/backgrounds/http/controller/GetBackgroundController";
import { GetBackgroundFeatOptionsController } from "#src/modules/backgrounds/http/controller/GetBackgroundFeatOptionsController";
import { GetBackgroundSectionController } from "#src/modules/backgrounds/http/controller/GetBackgroundSectionController";
import { GetBackgroundUsagesController } from "#src/modules/backgrounds/http/controller/GetBackgroundUsagesController";
import {
  ListBackgroundCatalogController,
  ListCampaignBackgroundsController,
  ListSystemBackgroundsController,
} from "#src/modules/backgrounds/http/controller/ListBackgroundsControllers";
import { ResolveBackgroundController } from "#src/modules/backgrounds/http/controller/ResolveBackgroundController";
import { RestoreBackgroundController } from "#src/modules/backgrounds/http/controller/RestoreBackgroundController";
import { UpdateBackgroundController } from "#src/modules/backgrounds/http/controller/UpdateBackgroundController";
import { ValidateBackgroundController } from "#src/modules/backgrounds/http/controller/ValidateBackgroundController";
import { registerBackgroundsRoutes } from "#src/modules/backgrounds/http/routes/v1/BackgroundsRoutes";
import { backgroundsPermissionDefinitions } from "#src/modules/backgrounds/permissions/BackgroundsPermissions";
import { BackgroundSelectionService } from "#src/modules/backgrounds/service/BackgroundSelectionService";
import { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";
import { BackgroundReader } from "#src/modules/backgrounds/useCase/BackgroundReader";
import { CreateBackgroundUseCase } from "#src/modules/backgrounds/useCase/CreateBackgroundUseCase";
import { DeleteBackgroundUseCase } from "#src/modules/backgrounds/useCase/DeleteBackgroundUseCase";
import { GetBackgroundFeatOptionsUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundFeatOptionsUseCase";
import { GetBackgroundSectionUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundSectionUseCase";
import { GetBackgroundUsagesUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundUsagesUseCase";
import { GetBackgroundUseCase } from "#src/modules/backgrounds/useCase/GetBackgroundUseCase";
import {
  BackgroundListing,
  ListBackgroundCatalogUseCase,
  ListCampaignBackgroundsUseCase,
  ListSystemBackgroundsUseCase,
} from "#src/modules/backgrounds/useCase/ListBackgroundsUseCase";
import { ResolveBackgroundUseCase } from "#src/modules/backgrounds/useCase/ResolveBackgroundUseCase";
import { RestoreBackgroundUseCase } from "#src/modules/backgrounds/useCase/RestoreBackgroundUseCase";
import { UpdateBackgroundUseCase } from "#src/modules/backgrounds/useCase/UpdateBackgroundUseCase";
import { ValidateBackgroundUseCase } from "#src/modules/backgrounds/useCase/ValidateBackgroundUseCase";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import { FEATS_MODULE_DEPENDENCIES, type FeatsModuleDependencies } from "#src/modules/feats/index";
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
} from "#src/modules/features/index";
import { ITEMS_MODULE_DEPENDENCIES, type ItemsModuleDependencies } from "#src/modules/items/index";
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
} from "#src/modules/ruleset/index";

export const BACKGROUNDS_MODULE_DEPENDENCIES = "backgrounds.module.dependencies";

/**
 * Public port of the backgrounds module. The character modules check a background through
 * `service` (`requireSelectableBackground`) and the choices of a character through `selection`
 * (`resolveBackground`, with the full definition), and store the assignment, the item instances,
 * coins and proficiencies it yields themselves, in their own transaction (passing its handle as
 * `db`), each value with the background as its source.
 */
export type BackgroundsModuleDependencies = {
  service: BackgroundsService;
  selection: BackgroundSelectionService;
};

async function registerBackgroundsModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("backgrounds", backgroundsPermissionDefinitions);

  const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  const campaigns = container.dependencies.require<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES);
  const assetLinks = container.dependencies.require<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES);
  const features = container.dependencies.require<FeaturesModuleDependencies>(FEATURES_MODULE_DEPENDENCIES);
  const feats = container.dependencies.require<FeatsModuleDependencies>(FEATS_MODULE_DEPENDENCIES);
  const items = container.dependencies.require<ItemsModuleDependencies>(ITEMS_MODULE_DEPENDENCIES);
  const rulesets = container.dependencies.require<RulesetModuleDependencies>(RULESET_MODULE_DEPENDENCIES);
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new BackgroundsService(
    container.db,
    container.transactionManager,
    new BackgroundsRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    feats.service,
    items.service,
    {
      findCampaignRole: (campaignId, actorId, db) => campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
      findEditionYears: (rulesetIds, db) => rulesets.repository.listEditionYears(db, rulesetIds),
    },
  );
  const selection = new BackgroundSelectionService(service);

  history.register(service.trackedBackground);
  // Custom features, feats and items of a released background become visible with it.
  assetsService.registerVisibilityProvider({
    name: "background-content",
    listVisibleAssetIds: (input, db) => service.listReleasedContentIds(input, db),
  });
  // Custom backgrounds reach players through a release, not through content shares.
  assetsService.registerContentType({
    assetType: "BACKGROUND",
    kind: "RULE",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: BACKGROUND_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });

  container.dependencies.set<BackgroundsModuleDependencies>(BACKGROUNDS_MODULE_DEPENDENCIES, {
    service,
    selection,
  });

  const listing = new BackgroundListing(service, assetsService);
  const reader = new BackgroundReader(service, assetsService);
  const catalogSectionControllers = Object.fromEntries(
    BACKGROUND_SECTIONS.map((section) => [
      section,
      new GetBackgroundSectionController(new GetBackgroundSectionUseCase(reader, section)),
    ]),
  ) as Record<BackgroundSection, GetBackgroundSectionController>;

  app.register(async (backgroundsApp) => {
    registerBackgroundsRoutes(backgroundsApp, {
      listCampaignBackgroundsController: new ListCampaignBackgroundsController(
        new ListCampaignBackgroundsUseCase(listing),
      ),
      listBackgroundCatalogController: new ListBackgroundCatalogController(
        new ListBackgroundCatalogUseCase(listing),
      ),
      listSystemBackgroundsController: new ListSystemBackgroundsController(
        new ListSystemBackgroundsUseCase(listing),
      ),
      getCampaignBackgroundController: new GetBackgroundController(
        new GetBackgroundUseCase(service, reader, "campaign"),
      ),
      getCatalogBackgroundController: new GetBackgroundController(
        new GetBackgroundUseCase(service, reader, "catalog"),
      ),
      getSystemBackgroundController: new GetBackgroundController(
        new GetBackgroundUseCase(service, reader, "system"),
      ),
      catalogSectionControllers,
      getCampaignBackgroundUsagesController: new GetBackgroundUsagesController(
        new GetBackgroundUsagesUseCase(service, assetsService, true),
      ),
      getCatalogBackgroundUsagesController: new GetBackgroundUsagesController(
        new GetBackgroundUsagesUseCase(service, assetsService, false),
      ),
      resolveBackgroundController: new ResolveBackgroundController(
        new ResolveBackgroundUseCase(reader, selection),
      ),
      getBackgroundFeatOptionsController: new GetBackgroundFeatOptionsController(
        new GetBackgroundFeatOptionsUseCase(reader, selection),
      ),
      createBackgroundController: new CreateBackgroundController(new CreateBackgroundUseCase(history, service)),
      updateBackgroundController: new UpdateBackgroundController(new UpdateBackgroundUseCase(history, service)),
      deleteBackgroundController: new DeleteBackgroundController(new DeleteBackgroundUseCase(history, service)),
      restoreBackgroundController: new RestoreBackgroundController(new RestoreBackgroundUseCase(history, service)),
      validateBackgroundController: new ValidateBackgroundController(new ValidateBackgroundUseCase(service)),
    });
  });
}

export const backgroundsModule: AppModule = {
  name: "backgrounds",
  dependencies: [
    "system",
    "auth",
    "history",
    "ruleset",
    "campaigns",
    "assets",
    "asset-links",
    "features",
    "feats",
    "items",
  ],
  register: registerBackgroundsModule,
};
