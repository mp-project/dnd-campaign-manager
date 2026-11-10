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
  CLASSES_MODULE_DEPENDENCIES,
  type ClassesModuleDependencies,
} from "#src/modules/classes/index";
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
} from "#src/modules/features/index";
import {
  SUBCLASS_SECTIONS,
  type SubclassSection,
} from "#src/modules/subclasses/domain/dto/ResponseSubclassDto";
import { SubclassesRepository } from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import { SUBCLASS_ASSET_ACTIONS } from "#src/modules/subclasses/history/TrackedSubclass";
import { CheckSubclassSelectionController } from "#src/modules/subclasses/http/controller/CheckSubclassSelectionController";
import { CreateSubclassController } from "#src/modules/subclasses/http/controller/CreateSubclassController";
import { DeleteSubclassController } from "#src/modules/subclasses/http/controller/DeleteSubclassController";
import { GetSubclassController } from "#src/modules/subclasses/http/controller/GetSubclassController";
import { GetSubclassSectionController } from "#src/modules/subclasses/http/controller/GetSubclassSectionController";
import { GetSubclassUsagesController } from "#src/modules/subclasses/http/controller/GetSubclassUsagesController";
import {
  ListCampaignSubclassesController,
  ListClassSubclassesController,
  ListSystemSubclassesController,
} from "#src/modules/subclasses/http/controller/ListSubclassesControllers";
import { RestoreSubclassController } from "#src/modules/subclasses/http/controller/RestoreSubclassController";
import { UpdateSubclassController } from "#src/modules/subclasses/http/controller/UpdateSubclassController";
import { ValidateSubclassController } from "#src/modules/subclasses/http/controller/ValidateSubclassController";
import { registerSubclassesRoutes } from "#src/modules/subclasses/http/routes/v1/SubclassesRoutes";
import { subclassesPermissionDefinitions } from "#src/modules/subclasses/permissions/SubclassesPermissions";
import { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";
import { CheckSubclassSelectionUseCase } from "#src/modules/subclasses/useCase/CheckSubclassSelectionUseCase";
import { CreateSubclassUseCase } from "#src/modules/subclasses/useCase/CreateSubclassUseCase";
import { DeleteSubclassUseCase } from "#src/modules/subclasses/useCase/DeleteSubclassUseCase";
import { GetSubclassSectionUseCase } from "#src/modules/subclasses/useCase/GetSubclassSectionUseCase";
import { GetSubclassUsagesUseCase } from "#src/modules/subclasses/useCase/GetSubclassUsagesUseCase";
import { GetSubclassUseCase } from "#src/modules/subclasses/useCase/GetSubclassUseCase";
import {
  ListCampaignSubclassesUseCase,
  ListClassSubclassesUseCase,
  ListSystemSubclassesUseCase,
  SubclassListing,
} from "#src/modules/subclasses/useCase/ListSubclassesUseCase";
import { RestoreSubclassUseCase } from "#src/modules/subclasses/useCase/RestoreSubclassUseCase";
import { SubclassReader } from "#src/modules/subclasses/useCase/SubclassReader";
import { UpdateSubclassUseCase } from "#src/modules/subclasses/useCase/UpdateSubclassUseCase";
import { ValidateSubclassUseCase } from "#src/modules/subclasses/useCase/ValidateSubclassUseCase";

export const SUBCLASSES_MODULE_DEPENDENCIES = "subclasses.module.dependencies";

/**
 * Public port of the subclasses module. Actor progression checks and reads a subclass for a class
 * assignment through `service` (`validateSelection`, `requireSelectableSubclass`,
 * `listReadableForClass`, `definitionFor`) and the read models in `SubclassViews`; it stores the
 * chosen subclass on the assignment itself, one per assignment.
 */
export type SubclassesModuleDependencies = {
  service: SubclassesService;
};

function requireDependency<T>(container: AppContainer, token: string, label: string): T {
  const dependency = container.dependencies.get<T>(token);

  if (!dependency) {
    throw new Error(`${label} module dependencies are missing`);
  }

  return dependency;
}

async function registerSubclassesModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "subclasses",
    subclassesPermissionDefinitions,
  );

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
  const classes = requireDependency<ClassesModuleDependencies>(
    container,
    CLASSES_MODULE_DEPENDENCIES,
    "Classes",
  );
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new SubclassesService(
    container.db,
    container.transactionManager,
    new SubclassesRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    classes.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
    },
  );

  history.register(service.trackedSubclass);
  // Custom features and spells of a released subclass become visible with it.
  assetsService.registerVisibilityProvider({
    name: "subclass-content",
    listVisibleAssetIds: (input, db) => service.listReleasedContentIds(input, db),
  });
  // Custom subclasses reach players through a release, not through content shares.
  assetsService.registerContentType({
    assetType: "SUBCLASS",
    kind: "RULE",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: SUBCLASS_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
    verifyDependents: (sources, db) => service.verifyDependents(sources, db),
  });

  container.dependencies.set<SubclassesModuleDependencies>(SUBCLASSES_MODULE_DEPENDENCIES, {
    service,
  });

  const listing = new SubclassListing(service, classes.service, assetsService);
  const reader = new SubclassReader(service, assetsService);
  const catalogSectionControllers = Object.fromEntries(
    SUBCLASS_SECTIONS.map((section) => [
      section,
      new GetSubclassSectionController(new GetSubclassSectionUseCase(reader, section)),
    ]),
  ) as Record<SubclassSection, GetSubclassSectionController>;

  app.register(async (subclassesApp) => {
    registerSubclassesRoutes(subclassesApp, {
      listCampaignSubclassesController: new ListCampaignSubclassesController(
        new ListCampaignSubclassesUseCase(listing),
      ),
      listClassSubclassesController: new ListClassSubclassesController(
        new ListClassSubclassesUseCase(listing),
      ),
      listSystemSubclassesController: new ListSystemSubclassesController(
        new ListSystemSubclassesUseCase(listing),
      ),
      getCampaignSubclassController: new GetSubclassController(
        new GetSubclassUseCase(service, reader, "campaign"),
      ),
      getCatalogSubclassController: new GetSubclassController(
        new GetSubclassUseCase(service, reader, "catalog"),
      ),
      getSystemSubclassController: new GetSubclassController(
        new GetSubclassUseCase(service, reader, "system"),
      ),
      catalogSectionControllers,
      checkSubclassSelectionController: new CheckSubclassSelectionController(
        new CheckSubclassSelectionUseCase(service, assetsService),
      ),
      createSubclassController: new CreateSubclassController(
        new CreateSubclassUseCase(history, service),
      ),
      updateSubclassController: new UpdateSubclassController(
        new UpdateSubclassUseCase(history, service),
      ),
      deleteSubclassController: new DeleteSubclassController(
        new DeleteSubclassUseCase(history, service),
      ),
      restoreSubclassController: new RestoreSubclassController(
        new RestoreSubclassUseCase(history, service),
      ),
      validateSubclassController: new ValidateSubclassController(
        new ValidateSubclassUseCase(service),
      ),
      getCampaignSubclassUsagesController: new GetSubclassUsagesController(
        new GetSubclassUsagesUseCase(service, assetsService, true),
      ),
      getCatalogSubclassUsagesController: new GetSubclassUsagesController(
        new GetSubclassUsagesUseCase(service, assetsService, false),
      ),
    });
  });
}

export const subclassesModule: AppModule = {
  name: "subclasses",
  dependencies: [
    "system",
    "auth",
    "history",
    "campaigns",
    "assets",
    "asset-links",
    "features",
    "classes",
  ],
  register: registerSubclassesModule,
};
