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
import { CLASS_SECTIONS, type ClassSection } from "#src/modules/classes/domain/dto/ResponseClassDto";
import { ClassesRepository } from "#src/modules/classes/domain/repository/ClassesRepository";
import { CLASS_ASSET_ACTIONS } from "#src/modules/classes/history/TrackedClass";
import { CreateClassController } from "#src/modules/classes/http/controller/CreateClassController";
import { DeleteClassController } from "#src/modules/classes/http/controller/DeleteClassController";
import { GetClassController } from "#src/modules/classes/http/controller/GetClassController";
import { GetClassSectionController } from "#src/modules/classes/http/controller/GetClassSectionController";
import { GetClassUsagesController } from "#src/modules/classes/http/controller/GetClassUsagesController";
import {
  ListCampaignClassesController,
  ListClassCatalogController,
  ListSystemClassesController,
} from "#src/modules/classes/http/controller/ListClassesControllers";
import { RestoreClassController } from "#src/modules/classes/http/controller/RestoreClassController";
import { UpdateClassController } from "#src/modules/classes/http/controller/UpdateClassController";
import { ValidateClassController } from "#src/modules/classes/http/controller/ValidateClassController";
import { registerClassesRoutes } from "#src/modules/classes/http/routes/v1/ClassesRoutes";
import { classesPermissionDefinitions } from "#src/modules/classes/permissions/ClassesPermissions";
import { ClassesService } from "#src/modules/classes/service/ClassesService";
import { ClassReader } from "#src/modules/classes/useCase/ClassReader";
import { CreateClassUseCase } from "#src/modules/classes/useCase/CreateClassUseCase";
import { DeleteClassUseCase } from "#src/modules/classes/useCase/DeleteClassUseCase";
import { GetClassSectionUseCase } from "#src/modules/classes/useCase/GetClassSectionUseCase";
import { GetClassUsagesUseCase } from "#src/modules/classes/useCase/GetClassUsagesUseCase";
import { GetClassUseCase } from "#src/modules/classes/useCase/GetClassUseCase";
import {
  ClassListing,
  ListCampaignClassesUseCase,
  ListClassCatalogUseCase,
  ListSystemClassesUseCase,
} from "#src/modules/classes/useCase/ListClassesUseCase";
import { RestoreClassUseCase } from "#src/modules/classes/useCase/RestoreClassUseCase";
import { UpdateClassUseCase } from "#src/modules/classes/useCase/UpdateClassUseCase";
import { ValidateClassUseCase } from "#src/modules/classes/useCase/ValidateClassUseCase";
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
} from "#src/modules/features/index";

export const CLASSES_MODULE_DEPENDENCIES = "classes.module.dependencies";

/**
 * Public port of the classes module. Actor progression reads classes through `service`
 * (`requireCatalogClass`, `requireSelectableClass`) and the read models in `ClassViews`
 * (`getProgression`, `getFeatureGrants`, `getMulticlassRequirements` …); it stores levels and
 * decisions itself.
 */
export type ClassesModuleDependencies = {
  service: ClassesService;
};

function requireDependency<T>(container: AppContainer, token: string, label: string): T {
  const dependency = container.dependencies.get<T>(token);

  if (!dependency) {
    throw new Error(`${label} module dependencies are missing`);
  }

  return dependency;
}

async function registerClassesModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions("classes", classesPermissionDefinitions);

  const assets = requireDependency<AssetsModuleDependencies>(
    container,
    ASSETS_MODULE_DEPENDENCIES,
    "Assets",
  );
  const campaigns = requireDependency<CampaignsModuleDependencies>(
    container,
    CAMPAIGNS_MODULE_DEPENDENCIES,
    "Campaigns",
  );
  const assetLinks = requireDependency<AssetLinksModuleDependencies>(
    container,
    ASSET_LINKS_MODULE_DEPENDENCIES,
    "Asset links",
  );
  const features = requireDependency<FeaturesModuleDependencies>(
    container,
    FEATURES_MODULE_DEPENDENCIES,
    "Features",
  );
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new ClassesService(
    container.db,
    container.transactionManager,
    new ClassesRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
    },
  );

  history.register(service.trackedClass);
  assetsService.allowOwnerRevert(CLASS_ASSET_ACTIONS);
  // Custom classes reach players through a release, not through content shares.
  assetsService.registerReleasableType("CLASS");
  // Custom features of a released class become visible with it.
  assetsService.registerVisibilityProvider({
    name: "class-features",
    listVisibleAssetIds: (input, db) => service.listReleasedFeatureIds(input, db),
  });
  // Archived classes keep nothing from being archived, so coming back needs the checks again.
  assetsService.registerReactivateHook({
    name: "classes",
    onReactivate: (asset, db) => service.assertReactivatable(asset, db),
  });
  assetLinks.service.registerEditRoute("CLASS", (input, db) => service.findEditRoutes(input, db));
  // Definitions that refer to an asset keep it from being archived; archived ones don't.
  assetLinks.service.registerUsageProvider({
    name: "classes",
    group: "typedUsages",
    listUsages: (input, db) => service.listUsages({ ...input, includeArchived: true }, db),
    listBlockingUsages: (input, db) =>
      service.listUsages({ ...input, includeArchived: false }, db),
  });

  container.dependencies.set<ClassesModuleDependencies>(CLASSES_MODULE_DEPENDENCIES, {
    service,
  });

  const listing = new ClassListing(service, assetsService);
  const reader = new ClassReader(service, assetsService);
  const catalogSectionControllers = Object.fromEntries(
    CLASS_SECTIONS.map((section) => [
      section,
      new GetClassSectionController(new GetClassSectionUseCase(reader, section)),
    ]),
  ) as Record<ClassSection, GetClassSectionController>;

  app.register(async (classesApp) => {
    registerClassesRoutes(classesApp, {
      listCampaignClassesController: new ListCampaignClassesController(
        new ListCampaignClassesUseCase(listing),
      ),
      listClassCatalogController: new ListClassCatalogController(
        new ListClassCatalogUseCase(listing),
      ),
      listSystemClassesController: new ListSystemClassesController(
        new ListSystemClassesUseCase(listing),
      ),
      getCampaignClassController: new GetClassController(
        new GetClassUseCase(service, reader, "campaign"),
      ),
      getCatalogClassController: new GetClassController(
        new GetClassUseCase(service, reader, "catalog"),
      ),
      getSystemClassController: new GetClassController(
        new GetClassUseCase(service, reader, "system"),
      ),
      catalogSectionControllers,
      createClassController: new CreateClassController(new CreateClassUseCase(history, service)),
      updateClassController: new UpdateClassController(new UpdateClassUseCase(history, service)),
      deleteClassController: new DeleteClassController(new DeleteClassUseCase(history, service)),
      restoreClassController: new RestoreClassController(
        new RestoreClassUseCase(history, service),
      ),
      validateClassController: new ValidateClassController(new ValidateClassUseCase(service)),
      getCampaignClassUsagesController: new GetClassUsagesController(
        new GetClassUsagesUseCase(service, assetsService, true),
      ),
      getCatalogClassUsagesController: new GetClassUsagesController(
        new GetClassUsagesUseCase(service, assetsService, false),
      ),
    });
  });
}

export const classesModule: AppModule = {
  name: "classes",
  dependencies: ["system", "auth", "history", "campaigns", "assets", "asset-links", "features"],
  register: registerClassesModule,
};
