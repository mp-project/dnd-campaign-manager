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
  SpellListsRepository,
  SpellsRepository,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import { SPELL_ASSET_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { CreateSpellController } from "#src/modules/spells/http/controller/CreateSpellController";
import { CreateSpellListController } from "#src/modules/spells/http/controller/CreateSpellListController";
import { DeleteSpellController } from "#src/modules/spells/http/controller/DeleteSpellController";
import { DeleteSpellListController } from "#src/modules/spells/http/controller/DeleteSpellListController";
import { GetSpellController } from "#src/modules/spells/http/controller/GetSpellController";
import { GetSpellEffectsController } from "#src/modules/spells/http/controller/GetSpellEffectsController";
import { GetSpellListController } from "#src/modules/spells/http/controller/GetSpellListController";
import { GetSpellListUsagesController } from "#src/modules/spells/http/controller/GetSpellListUsagesController";
import { GetSpellListsOfSpellController } from "#src/modules/spells/http/controller/GetSpellListsOfSpellController";
import { GetSpellUsagesController } from "#src/modules/spells/http/controller/GetSpellUsagesController";
import { ListCampaignSpellListsController } from "#src/modules/spells/http/controller/ListCampaignSpellListsController";
import { ListCampaignSpellsController } from "#src/modules/spells/http/controller/ListCampaignSpellsController";
import { ListSpellCatalogController } from "#src/modules/spells/http/controller/ListSpellCatalogController";
import { ListSpellListCatalogController } from "#src/modules/spells/http/controller/ListSpellListCatalogController";
import { ListSpellListSpellsController } from "#src/modules/spells/http/controller/ListSpellListSpellsController";
import { ListSystemSpellListsController } from "#src/modules/spells/http/controller/ListSystemSpellListsController";
import { ListSystemSpellsController } from "#src/modules/spells/http/controller/ListSystemSpellsController";
import { ResolveSpellController } from "#src/modules/spells/http/controller/ResolveSpellController";
import { RestoreSpellController } from "#src/modules/spells/http/controller/RestoreSpellController";
import { RestoreSpellListController } from "#src/modules/spells/http/controller/RestoreSpellListController";
import { UpdateSpellController } from "#src/modules/spells/http/controller/UpdateSpellController";
import { UpdateSpellListController } from "#src/modules/spells/http/controller/UpdateSpellListController";
import { ValidateSpellController } from "#src/modules/spells/http/controller/ValidateSpellController";
import { ValidateSpellListController } from "#src/modules/spells/http/controller/ValidateSpellListController";
import {
  registerSpellsRoutes,
  type SpellsRouteControllers,
} from "#src/modules/spells/http/routes/v1/SpellsRoutes";
import { spellsPermissionDefinitions } from "#src/modules/spells/permissions/SpellsPermissions";
import { SpellsService } from "#src/modules/spells/service/SpellsService";
import { CreateSpellListUseCase } from "#src/modules/spells/useCase/CreateSpellListUseCase";
import { CreateSpellUseCase } from "#src/modules/spells/useCase/CreateSpellUseCase";
import { DeleteSpellListUseCase } from "#src/modules/spells/useCase/DeleteSpellListUseCase";
import { DeleteSpellUseCase } from "#src/modules/spells/useCase/DeleteSpellUseCase";
import { GetSpellEffectsUseCase } from "#src/modules/spells/useCase/GetSpellEffectsUseCase";
import { GetSpellListUsagesUseCase } from "#src/modules/spells/useCase/GetSpellListUsagesUseCase";
import { GetSpellListUseCase } from "#src/modules/spells/useCase/GetSpellListUseCase";
import { GetSpellListsOfSpellUseCase } from "#src/modules/spells/useCase/GetSpellListsOfSpellUseCase";
import { GetSpellUsagesUseCase } from "#src/modules/spells/useCase/GetSpellUsagesUseCase";
import { GetSpellUseCase } from "#src/modules/spells/useCase/GetSpellUseCase";
import { ListCampaignSpellListsUseCase } from "#src/modules/spells/useCase/ListCampaignSpellListsUseCase";
import { ListCampaignSpellsUseCase } from "#src/modules/spells/useCase/ListCampaignSpellsUseCase";
import { ListSpellCatalogUseCase } from "#src/modules/spells/useCase/ListSpellCatalogUseCase";
import { ListSpellListCatalogUseCase } from "#src/modules/spells/useCase/ListSpellListCatalogUseCase";
import { ListSpellListSpellsUseCase } from "#src/modules/spells/useCase/ListSpellListSpellsUseCase";
import { ListSystemSpellListsUseCase } from "#src/modules/spells/useCase/ListSystemSpellListsUseCase";
import { ListSystemSpellsUseCase } from "#src/modules/spells/useCase/ListSystemSpellsUseCase";
import { ResolveSpellUseCase } from "#src/modules/spells/useCase/ResolveSpellUseCase";
import { RestoreSpellListUseCase } from "#src/modules/spells/useCase/RestoreSpellListUseCase";
import { RestoreSpellUseCase } from "#src/modules/spells/useCase/RestoreSpellUseCase";
import { SpellListing } from "#src/modules/spells/useCase/SpellListing";
import { SpellReader } from "#src/modules/spells/useCase/SpellReader";
import { UpdateSpellListUseCase } from "#src/modules/spells/useCase/UpdateSpellListUseCase";
import { UpdateSpellUseCase } from "#src/modules/spells/useCase/UpdateSpellUseCase";
import { ValidateSpellListUseCase } from "#src/modules/spells/useCase/ValidateSpellListUseCase";
import { ValidateSpellUseCase } from "#src/modules/spells/useCase/ValidateSpellUseCase";

export const SPELLS_MODULE_DEPENDENCIES = "spells.module.dependencies";

/**
 * Public port of the spells module. The actor modules read spells through `service`
 * (`requireSelectableSpell`, `requireReadableSpell`, `checkSpellAccess` for a spell from given
 * lists up to a level, `listsOfSpell`) with the full view, and resolve a cast with
 * `resolveSpellCast` from `SpellCasting`. They store which spells an actor knows or prepared,
 * slots and concentration themselves, in their own transaction, and pass its handle as `db`.
 */
export type SpellsModuleDependencies = {
  service: SpellsService;
};

async function registerSpellsModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("spells", spellsPermissionDefinitions);

  const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  const campaigns = container.dependencies.require<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES);
  const assetLinks = container.dependencies.require<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES);
  const classes = container.dependencies.require<ClassesModuleDependencies>(CLASSES_MODULE_DEPENDENCIES);
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const service = new SpellsService(
    container.db,
    container.transactionManager,
    new SpellsRepository(),
    new SpellListsRepository(),
    assetsService,
    assetLinks.service,
    {
      findCampaignRole: (campaignId, actorId, db) =>
        campaigns.service.findCampaignRole(campaignId, actorId, db),
      findRulesetId: async (campaignId, db) =>
        (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
    },
  );

  history.register(service.trackedSpell);
  history.register(service.trackedSpellList);
  // Custom spells of a released list become visible with it.
  assetsService.registerVisibilityProvider({
    name: "spell-list-entries",
    listVisibleAssetIds: (input, db) => service.listReleasedEntryIds(input, db),
  });
  // Custom spells and lists reach players through a release, not through content shares.
  assetsService.registerContentType({
    assetType: "SPELL",
    kind: "RULE",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: SPELL_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });
  assetsService.registerContentType({
    assetType: "SPELL_LIST",
    kind: "RULE",
    editRoutes: (input, db) => service.findListEditRoutes(input, db),
    revertibleActions: SPELL_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });

  container.dependencies.set<SpellsModuleDependencies>(SPELLS_MODULE_DEPENDENCIES, { service });

  const listing = new SpellListing(service, assetsService, async (access, classId) => {
    const found = await classes.service.requireReadableClass(access, classId, "CATALOG");
    const spellcasting = found.characterClass.spellcasting as { spellListAssetId?: unknown } | null;

    return typeof spellcasting?.spellListAssetId === "string" ? spellcasting.spellListAssetId : null;
  });
  const reader = new SpellReader(service, assetsService);
  const controllers: SpellsRouteControllers = {
    listCampaignSpells: new ListCampaignSpellsController(new ListCampaignSpellsUseCase(listing)),
    createCampaignSpell: new CreateSpellController(new CreateSpellUseCase(history, service)),
    getCampaignSpell: new GetSpellController(new GetSpellUseCase(service, reader, "campaign")),
    updateCampaignSpell: new UpdateSpellController(new UpdateSpellUseCase(history, service)),
    deleteCampaignSpell: new DeleteSpellController(new DeleteSpellUseCase(history, service)),
    restoreCampaignSpell: new RestoreSpellController(new RestoreSpellUseCase(history, service)),
    validateCampaignSpell: new ValidateSpellController(new ValidateSpellUseCase(service)),
    getCampaignSpellUsages: new GetSpellUsagesController(new GetSpellUsagesUseCase(reader, service, true)),
    listSpellCatalog: new ListSpellCatalogController(new ListSpellCatalogUseCase(listing)),
    getCatalogSpell: new GetSpellController(new GetSpellUseCase(service, reader, "catalog")),
    getCatalogSpellEffects: new GetSpellEffectsController(new GetSpellEffectsUseCase(reader)),
    getCatalogSpellLists: new GetSpellListsOfSpellController(new GetSpellListsOfSpellUseCase(reader, service)),
    getCatalogSpellUsages: new GetSpellUsagesController(new GetSpellUsagesUseCase(reader, service, false)),
    resolveSpell: new ResolveSpellController(new ResolveSpellUseCase(reader)),
    listSystemSpells: new ListSystemSpellsController(new ListSystemSpellsUseCase(listing)),
    createSystemSpell: new CreateSpellController(new CreateSpellUseCase(history, service)),
    getSystemSpell: new GetSpellController(new GetSpellUseCase(service, reader, "system")),
    updateSystemSpell: new UpdateSpellController(new UpdateSpellUseCase(history, service)),
    deleteSystemSpell: new DeleteSpellController(new DeleteSpellUseCase(history, service)),
    restoreSystemSpell: new RestoreSpellController(new RestoreSpellUseCase(history, service)),
    validateSystemSpell: new ValidateSpellController(new ValidateSpellUseCase(service)),

    listCampaignSpellLists: new ListCampaignSpellListsController(new ListCampaignSpellListsUseCase(listing)),
    createCampaignSpellList: new CreateSpellListController(new CreateSpellListUseCase(history, service)),
    getCampaignSpellList: new GetSpellListController(new GetSpellListUseCase(service, reader, "campaign")),
    updateCampaignSpellList: new UpdateSpellListController(new UpdateSpellListUseCase(history, service)),
    deleteCampaignSpellList: new DeleteSpellListController(new DeleteSpellListUseCase(history, service)),
    restoreCampaignSpellList: new RestoreSpellListController(new RestoreSpellListUseCase(history, service)),
    validateCampaignSpellList: new ValidateSpellListController(new ValidateSpellListUseCase(service)),
    getCampaignSpellListUsages: new GetSpellListUsagesController(
      new GetSpellListUsagesUseCase(reader, service, true),
    ),
    listSpellListCatalog: new ListSpellListCatalogController(new ListSpellListCatalogUseCase(listing)),
    getCatalogSpellList: new GetSpellListController(new GetSpellListUseCase(service, reader, "catalog")),
    listCatalogSpellListSpells: new ListSpellListSpellsController(new ListSpellListSpellsUseCase(listing)),
    getCatalogSpellListUsages: new GetSpellListUsagesController(
      new GetSpellListUsagesUseCase(reader, service, false),
    ),
    listSystemSpellLists: new ListSystemSpellListsController(new ListSystemSpellListsUseCase(listing)),
    createSystemSpellList: new CreateSpellListController(new CreateSpellListUseCase(history, service)),
    getSystemSpellList: new GetSpellListController(new GetSpellListUseCase(service, reader, "system")),
    updateSystemSpellList: new UpdateSpellListController(new UpdateSpellListUseCase(history, service)),
    deleteSystemSpellList: new DeleteSpellListController(new DeleteSpellListUseCase(history, service)),
    restoreSystemSpellList: new RestoreSpellListController(new RestoreSpellListUseCase(history, service)),
    validateSystemSpellList: new ValidateSpellListController(new ValidateSpellListUseCase(service)),
  };

  app.register(async (spellsApp) => {
    registerSpellsRoutes(spellsApp, controllers);
  });
}

export const spellsModule: AppModule = {
  name: "spells",
  dependencies: ["system", "auth", "history", "campaigns", "assets", "asset-links", "classes"],
  register: registerSpellsModule,
};
