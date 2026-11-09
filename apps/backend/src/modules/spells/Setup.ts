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
import {
  SpellController,
  type SpellRequest,
  SpellRequests,
} from "#src/modules/spells/http/controller/SpellControllers";
import {
  registerSpellsRoutes,
  type SpellsRouteControllers,
} from "#src/modules/spells/http/routes/v1/SpellsRoutes";
import { spellsPermissionDefinitions } from "#src/modules/spells/permissions/SpellsPermissions";
import { SpellsService } from "#src/modules/spells/service/SpellsService";
import {
  ListCampaignSpellListsUseCase,
  ListCampaignSpellsUseCase,
  ListSpellCatalogUseCase,
  ListSpellListCatalogUseCase,
  ListSpellListSpellsUseCase,
  ListSystemSpellListsUseCase,
  ListSystemSpellsUseCase,
  SpellListing,
} from "#src/modules/spells/useCase/ListSpellsUseCase";
import {
  GetSpellEffectsUseCase,
  GetSpellListsOfSpellUseCase,
  GetSpellListUsagesUseCase,
  GetSpellListUseCase,
  GetSpellUsagesUseCase,
  GetSpellUseCase,
  ResolveSpellUseCase,
} from "#src/modules/spells/useCase/SpellReadUseCases";
import { SpellReader } from "#src/modules/spells/useCase/SpellReader";
import {
  ChangeSpellListLifecycleUseCase,
  ChangeSpellLifecycleUseCase,
  CreateSpellListUseCase,
  CreateSpellUseCase,
  UpdateSpellListUseCase,
  UpdateSpellUseCase,
  ValidateSpellContentUseCase,
} from "#src/modules/spells/useCase/SpellWriteUseCases";

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
  const R = SpellRequests;
  const controller = <Input, Output>(
    parse: (request: SpellRequest) => Input,
    useCase: { execute(context: SpellRequest["requestContext"], input: Input): Promise<Output> },
  ) => new SpellController(parse, useCase);

  const controllers: SpellsRouteControllers = {
    listCampaignSpells: controller(R.listCampaign, new ListCampaignSpellsUseCase(listing)),
    createCampaignSpell: controller(R.create, new CreateSpellUseCase(history, service)),
    getCampaignSpell: controller(R.spell, new GetSpellUseCase(service, reader, "campaign")),
    updateCampaignSpell: controller(R.update, new UpdateSpellUseCase(history, service)),
    deleteCampaignSpell: controller(R.lifecycle("query"), new ChangeSpellLifecycleUseCase(history, service, true)),
    restoreCampaignSpell: controller(R.lifecycle("body"), new ChangeSpellLifecycleUseCase(history, service, false)),
    validateCampaignSpell: controller(R.validate, new ValidateSpellContentUseCase(service, "spell")),
    getCampaignSpellUsages: controller(R.catalogSpell, new GetSpellUsagesUseCase(reader, service, true)),
    listSpellCatalog: controller(R.listCatalog, new ListSpellCatalogUseCase(listing)),
    getCatalogSpell: controller(R.spell, new GetSpellUseCase(service, reader, "catalog")),
    getCatalogSpellEffects: controller(R.catalogSpell, new GetSpellEffectsUseCase(reader)),
    getCatalogSpellLists: controller(R.catalogSpell, new GetSpellListsOfSpellUseCase(reader, service)),
    getCatalogSpellUsages: controller(R.catalogSpell, new GetSpellUsagesUseCase(reader, service, false)),
    resolveSpell: controller(R.resolve, new ResolveSpellUseCase(reader)),
    listSystemSpells: controller(R.listSystem, new ListSystemSpellsUseCase(listing)),
    createSystemSpell: controller(R.create, new CreateSpellUseCase(history, service)),
    getSystemSpell: controller(R.spell, new GetSpellUseCase(service, reader, "system")),
    updateSystemSpell: controller(R.update, new UpdateSpellUseCase(history, service)),
    deleteSystemSpell: controller(R.lifecycle("query"), new ChangeSpellLifecycleUseCase(history, service, true)),
    restoreSystemSpell: controller(R.lifecycle("body"), new ChangeSpellLifecycleUseCase(history, service, false)),
    validateSystemSpell: controller(R.validate, new ValidateSpellContentUseCase(service, "spell")),

    listCampaignSpellLists: controller(R.listCampaignLists, new ListCampaignSpellListsUseCase(listing)),
    createCampaignSpellList: controller(R.createList, new CreateSpellListUseCase(history, service)),
    getCampaignSpellList: controller(R.spellList, new GetSpellListUseCase(service, reader, "campaign")),
    updateCampaignSpellList: controller(R.updateList, new UpdateSpellListUseCase(history, service)),
    deleteCampaignSpellList: controller(
      R.listLifecycle("query"),
      new ChangeSpellListLifecycleUseCase(history, service, true),
    ),
    restoreCampaignSpellList: controller(
      R.listLifecycle("body"),
      new ChangeSpellListLifecycleUseCase(history, service, false),
    ),
    validateCampaignSpellList: controller(R.validateList, new ValidateSpellContentUseCase(service, "spell list")),
    getCampaignSpellListUsages: controller(R.catalogSpellList, new GetSpellListUsagesUseCase(reader, service, true)),
    listSpellListCatalog: controller(R.listListCatalog, new ListSpellListCatalogUseCase(listing)),
    getCatalogSpellList: controller(R.spellList, new GetSpellListUseCase(service, reader, "catalog")),
    listCatalogSpellListSpells: controller(R.listSpellsOfList, new ListSpellListSpellsUseCase(listing)),
    getCatalogSpellListUsages: controller(R.catalogSpellList, new GetSpellListUsagesUseCase(reader, service, false)),
    listSystemSpellLists: controller(R.listSystemLists, new ListSystemSpellListsUseCase(listing)),
    createSystemSpellList: controller(R.createList, new CreateSpellListUseCase(history, service)),
    getSystemSpellList: controller(R.spellList, new GetSpellListUseCase(service, reader, "system")),
    updateSystemSpellList: controller(R.updateList, new UpdateSpellListUseCase(history, service)),
    deleteSystemSpellList: controller(
      R.listLifecycle("query"),
      new ChangeSpellListLifecycleUseCase(history, service, true),
    ),
    restoreSystemSpellList: controller(
      R.listLifecycle("body"),
      new ChangeSpellListLifecycleUseCase(history, service, false),
    ),
    validateSystemSpellList: controller(R.validateList, new ValidateSpellContentUseCase(service, "spell list")),
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
