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
import {
  RULESET_MODULE_DEPENDENCIES,
  type RulesetModuleDependencies,
} from "#src/modules/ruleset/index";
import { SpeciesRepository } from "#src/modules/species/domain/repository/SpeciesRepository";
import { SPECIES_ASSET_ACTIONS } from "#src/modules/species/history/TrackedSpecies";
import { CreateSpeciesController } from "#src/modules/species/http/controller/CreateSpeciesController";
import { CreateSpeciesVariantController } from "#src/modules/species/http/controller/CreateSpeciesVariantController";
import { DeleteSpeciesController } from "#src/modules/species/http/controller/DeleteSpeciesController";
import { DeleteSpeciesVariantController } from "#src/modules/species/http/controller/DeleteSpeciesVariantController";
import { GetSpeciesController } from "#src/modules/species/http/controller/GetSpeciesController";
import { GetSpeciesCreationOptionsController } from "#src/modules/species/http/controller/GetSpeciesCreationOptionsController";
import { GetSpeciesFeaturesController } from "#src/modules/species/http/controller/GetSpeciesFeaturesController";
import { GetSpeciesUsagesController } from "#src/modules/species/http/controller/GetSpeciesUsagesController";
import { GetSpeciesVariantController } from "#src/modules/species/http/controller/GetSpeciesVariantController";
import {
  ListCampaignSpeciesController,
  ListSpeciesCatalogController,
  ListSystemSpeciesController,
} from "#src/modules/species/http/controller/ListSpeciesControllers";
import { ListSpeciesVariantsController } from "#src/modules/species/http/controller/ListSpeciesVariantsController";
import { ResolveSpeciesSelectionController } from "#src/modules/species/http/controller/ResolveSpeciesSelectionController";
import { RestoreSpeciesController } from "#src/modules/species/http/controller/RestoreSpeciesController";
import { RestoreSpeciesVariantController } from "#src/modules/species/http/controller/RestoreSpeciesVariantController";
import { UpdateSpeciesController } from "#src/modules/species/http/controller/UpdateSpeciesController";
import { UpdateSpeciesVariantController } from "#src/modules/species/http/controller/UpdateSpeciesVariantController";
import { ValidateSpeciesController } from "#src/modules/species/http/controller/ValidateSpeciesController";
import { ValidateSpeciesVariantController } from "#src/modules/species/http/controller/ValidateSpeciesVariantController";
import { registerSpeciesRoutes } from "#src/modules/species/http/routes/v1/SpeciesRoutes";
import { speciesPermissionDefinitions } from "#src/modules/species/permissions/SpeciesPermissions";
import { SpeciesSelectionService } from "#src/modules/species/service/SpeciesSelectionService";
import { SpeciesService } from "#src/modules/species/service/SpeciesService";
import { SpeciesVariantsService } from "#src/modules/species/service/SpeciesVariantsService";
import { CreateSpeciesUseCase } from "#src/modules/species/useCase/CreateSpeciesUseCase";
import { CreateSpeciesVariantUseCase } from "#src/modules/species/useCase/CreateSpeciesVariantUseCase";
import { DeleteSpeciesUseCase } from "#src/modules/species/useCase/DeleteSpeciesUseCase";
import { DeleteSpeciesVariantUseCase } from "#src/modules/species/useCase/DeleteSpeciesVariantUseCase";
import { GetSpeciesUseCase } from "#src/modules/species/useCase/GetSpeciesUseCase";
import {
  ListCampaignSpeciesUseCase,
  ListSpeciesCatalogUseCase,
  ListSystemSpeciesUseCase,
  SpeciesListing,
} from "#src/modules/species/useCase/ListSpeciesUseCase";
import { RestoreSpeciesUseCase } from "#src/modules/species/useCase/RestoreSpeciesUseCase";
import { RestoreSpeciesVariantUseCase } from "#src/modules/species/useCase/RestoreSpeciesVariantUseCase";
import {
  GetSpeciesCreationOptionsUseCase,
  GetSpeciesFeaturesUseCase,
  GetSpeciesUsagesUseCase,
  ResolveSpeciesSelectionUseCase,
} from "#src/modules/species/useCase/SpeciesCatalogUseCases";
import { SpeciesReader, type SpeciesReadMode } from "#src/modules/species/useCase/SpeciesReader";
import {
  GetSpeciesVariantUseCase,
  ListSpeciesVariantsUseCase,
} from "#src/modules/species/useCase/SpeciesVariantsReadUseCase";
import { UpdateSpeciesUseCase } from "#src/modules/species/useCase/UpdateSpeciesUseCase";
import { UpdateSpeciesVariantUseCase } from "#src/modules/species/useCase/UpdateSpeciesVariantUseCase";
import {
  ValidateSpeciesUseCase,
  ValidateSpeciesVariantUseCase,
} from "#src/modules/species/useCase/ValidateSpeciesUseCase";

export const SPECIES_MODULE_DEPENDENCIES = "species.module.dependencies";

/**
 * Public port of the species module. Character modules read species through `service`
 * (`requireCatalogSpecies`, `isAvailableInCatalog`), their variants through `variants`
 * (`listAvailable`) and check and resolve a character's choice through `selection`
 * (`validateSpeciesSelection`, `resolveSpeciesSelection`, `getCreationOptions`). They store the
 * choice themselves, in their own transaction; inside it they pass its handle as `db` to every one
 * of these reads, because a read on the pool would need a second connection while the first is
 * held. Resolve with the full view (`isVisible` always true): the player view leaves hidden grants
 * out entirely and is only a preview. This module changes no actor.
 */
export type SpeciesModuleDependencies = {
  service: SpeciesService;
  variants: SpeciesVariantsService;
  selection: SpeciesSelectionService;
};

const READ_MODES: readonly SpeciesReadMode[] = ["campaign", "catalog", "system"];

function perMode<T>(build: (mode: SpeciesReadMode) => T): Record<SpeciesReadMode, T> {
  return Object.fromEntries(READ_MODES.map((mode) => [mode, build(mode)])) as Record<
    SpeciesReadMode,
    T
  >;
}

async function registerSpeciesModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("species", speciesPermissionDefinitions);

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
  const service = new SpeciesService(
    container.db,
    container.transactionManager,
    new SpeciesRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
      findRulesetIds: (campaignIds, db) => campaigns.repository.listRulesetIds(db, campaignIds),
      findEditionYears: (rulesetIds, db) => rulesets.repository.listEditionYears(db, rulesetIds),
    },
  );
  const variants = new SpeciesVariantsService(service);
  const selection = new SpeciesSelectionService(features.service);

  history.register(service.trackedSpecies);
  history.register(service.trackedVariant);
  assetsService.allowOwnerRevert(SPECIES_ASSET_ACTIONS);
  // Custom species and variants reach players through a release, not through content shares.
  assetsService.registerReleasableType("SPECIES");
  assetsService.registerReleasableType("SPECIES_VARIANT");
  // Custom features of a released species or variant become visible with it.
  assetsService.registerVisibilityProvider({
    name: "species-features",
    listVisibleAssetIds: (input, db) => service.listReleasedFeatureIds(input, db),
  });
  // Features granted by 2024 species may not start raising ability scores later.
  features.service.registerChangeGuard((change, db) =>
    service.assertFeatureChangeAllowed(change, db),
  );
  // Archived content keeps nothing from being archived, so coming back needs the checks again.
  assetsService.registerReactivateHook({
    name: "species",
    onReactivate: (asset, db) => service.assertReactivatable(asset, db),
  });
  assetLinks.service.registerEditRoute("SPECIES", (input, db) => service.findEditRoutes(input, db));
  assetLinks.service.registerEditRoute("SPECIES_VARIANT", (input, db) =>
    service.findVariantEditRoutes(input, db),
  );
  // Definitions that refer to an asset keep it from being archived, and so do the variants of a
  // species; archived ones don't.
  assetLinks.service.registerUsageProvider({
    name: "species",
    group: "typedUsages",
    listUsages: (input, db) => service.listUsages({ ...input, includeArchived: true }, db),
    listBlockingUsages: (input, db) => service.listUsages({ ...input, includeArchived: false }, db),
  });

  container.dependencies.set<SpeciesModuleDependencies>(SPECIES_MODULE_DEPENDENCIES, {
    service,
    variants,
    selection,
  });

  const listing = new SpeciesListing(service, assetsService);
  const reader = new SpeciesReader(service, variants, assetsService);

  app.register(async (speciesApp) => {
    registerSpeciesRoutes(speciesApp, {
      listCampaignSpeciesController: new ListCampaignSpeciesController(
        new ListCampaignSpeciesUseCase(listing),
      ),
      listSpeciesCatalogController: new ListSpeciesCatalogController(
        new ListSpeciesCatalogUseCase(listing),
      ),
      listSystemSpeciesController: new ListSystemSpeciesController(
        new ListSystemSpeciesUseCase(listing),
      ),
      getSpeciesControllers: perMode(
        (mode) => new GetSpeciesController(new GetSpeciesUseCase(service, reader, mode)),
      ),
      listVariantsControllers: perMode(
        (mode) =>
          new ListSpeciesVariantsController(new ListSpeciesVariantsUseCase(reader, variants, mode)),
      ),
      getVariantControllers: perMode(
        (mode) =>
          new GetSpeciesVariantController(new GetSpeciesVariantUseCase(reader, variants, mode)),
      ),
      createSpeciesController: new CreateSpeciesController(
        new CreateSpeciesUseCase(history, service),
      ),
      updateSpeciesController: new UpdateSpeciesController(
        new UpdateSpeciesUseCase(history, service),
      ),
      deleteSpeciesController: new DeleteSpeciesController(
        new DeleteSpeciesUseCase(history, service),
      ),
      restoreSpeciesController: new RestoreSpeciesController(
        new RestoreSpeciesUseCase(history, service),
      ),
      validateSpeciesController: new ValidateSpeciesController(new ValidateSpeciesUseCase(service)),
      createVariantController: new CreateSpeciesVariantController(
        new CreateSpeciesVariantUseCase(history, service, variants),
      ),
      updateVariantController: new UpdateSpeciesVariantController(
        new UpdateSpeciesVariantUseCase(history, service, variants),
      ),
      deleteVariantController: new DeleteSpeciesVariantController(
        new DeleteSpeciesVariantUseCase(history, service, variants),
      ),
      restoreVariantController: new RestoreSpeciesVariantController(
        new RestoreSpeciesVariantUseCase(history, service, variants),
      ),
      validateVariantController: new ValidateSpeciesVariantController(
        new ValidateSpeciesVariantUseCase(service, variants),
      ),
      getFeaturesController: new GetSpeciesFeaturesController(
        new GetSpeciesFeaturesUseCase(reader),
      ),
      getCreationOptionsController: new GetSpeciesCreationOptionsController(
        new GetSpeciesCreationOptionsUseCase(reader, selection),
      ),
      resolveSelectionController: new ResolveSpeciesSelectionController(
        new ResolveSpeciesSelectionUseCase(reader, selection),
      ),
      getCampaignUsagesController: new GetSpeciesUsagesController(
        new GetSpeciesUsagesUseCase(reader, service, true),
      ),
      getCatalogUsagesController: new GetSpeciesUsagesController(
        new GetSpeciesUsagesUseCase(reader, service, false),
      ),
    });
  });
}

export const speciesModule: AppModule = {
  name: "species",
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
  register: registerSpeciesModule,
};
