import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/index";
import { ASSETS_MODULE_DEPENDENCIES, type AssetsModuleDependencies } from "#src/modules/assets/index";
import {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/index";
import {
  FEATURES_MODULE_DEPENDENCIES,
  type FeaturesModuleDependencies,
} from "#src/modules/features/index";
import {
  ItemInstancesRepository,
  ItemsRepository,
} from "#src/modules/items/domain/repository/ItemsRepository";
import { ITEM_ASSET_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemController, type ItemRequest, ItemRequests } from "#src/modules/items/http/controller/ItemControllers";
import { type ItemsRouteControllers, registerItemsRoutes } from "#src/modules/items/http/routes/v1/ItemsRoutes";
import { itemsPermissionDefinitions } from "#src/modules/items/permissions/ItemsPermissions";
import { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import { type ItemCampaignAccessPort, ItemsService } from "#src/modules/items/service/ItemsService";
import {
  CreateItemInstanceUseCase,
  DeleteItemInstanceUseCase,
  GetItemInstanceUseCase,
  IdentifyItemInstanceUseCase,
  instanceCommands,
  ItemInstancePresenter,
  ListInstancesOfItemUseCase,
  ListItemInstancesUseCase,
  MergeItemInstancesUseCase,
  ResolveItemInstanceUseCase,
  SplitItemInstanceUseCase,
  TransferItemInstanceUseCase,
} from "#src/modules/items/useCase/ItemInstanceUseCases";
import { ItemReader } from "#src/modules/items/useCase/ItemReader";
import {
  ChangeItemLifecycleUseCase,
  CreateItemUseCase,
  ForkItemUseCase,
  GetItemEffectsUseCase,
  GetItemUsagesUseCase,
  GetItemUseCase,
  ItemListing,
  ListCampaignItemsUseCase,
  ListSystemItemsUseCase,
  ResolveItemUseCase,
  UpdateItemUseCase,
  ValidateItemUseCase,
} from "#src/modules/items/useCase/ItemUseCases";
import { SPELLS_MODULE_DEPENDENCIES, type SpellsModuleDependencies } from "#src/modules/spells/index";

export const ITEMS_MODULE_DEPENDENCIES = "items.module.dependencies";

/**
 * Public port of the items module, for the character modules. `service` reads definitions
 * (`requireReadableItem`, `findByAsset`) and calculates what an item gives an actor (`resolve`:
 * attack, damage, armor class, effects, spells and granted features). `instances` creates and
 * changes instances in the caller's action (`create`, `transfer`, `equip`, `attune`,
 * `spendCharge` …); the character modules pass a character asset as owner of type `ACTOR`.
 */
export type ItemsModuleDependencies = {
  service: ItemsService;
  instances: ItemInstancesService;
};

async function registerItemsModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerDefinitions("items", itemsPermissionDefinitions);

  const assets = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  const campaigns = container.dependencies.require<CampaignsModuleDependencies>(CAMPAIGNS_MODULE_DEPENDENCIES);
  const assetLinks = container.dependencies.require<AssetLinksModuleDependencies>(ASSET_LINKS_MODULE_DEPENDENCIES);
  const features = container.dependencies.require<FeaturesModuleDependencies>(FEATURES_MODULE_DEPENDENCIES);
  const spells = container.dependencies.require<SpellsModuleDependencies>(SPELLS_MODULE_DEPENDENCIES);
  const history = container.ports.history;

  if (!history) {
    throw new Error("History port is missing");
  }

  const assetsService = assets.service;
  const campaignAccess: ItemCampaignAccessPort = {
    findCampaignRole: (campaignId, actorId, db) => campaigns.service.findCampaignRole(campaignId, actorId, db),
    findRulesetId: async (campaignId, db) =>
      (await campaigns.repository.findMembershipCampaign(db, campaignId))?.rulesetId ?? null,
  };
  const service = new ItemsService(
    container.db,
    container.transactionManager,
    new ItemsRepository(),
    assetsService,
    assetLinks.service,
    features.service,
    spells.service,
    campaignAccess,
  );
  const instances = new ItemInstancesService(
    container.db,
    container.transactionManager,
    new ItemInstancesRepository(),
    service,
    assetsService,
    campaignAccess,
  );

  history.register(service.trackedItem);
  history.register(instances.trackedInstance);
  history.register(instances.trackedKnowledge);
  // Custom items reach players through a release; instances through what players know of them.
  assetsService.registerContentType({
    assetType: "ITEM",
    kind: "RULE",
    editRoutes: (input, db) => service.findEditRoutes(input, db),
    revertibleActions: ITEM_ASSET_ACTIONS,
    references: (asset, db) => service.listContentReferences(asset, db),
    verify: (asset, db) => service.verifyContent(asset, db),
  });
  // An item with instances can't be archived, also not by undoing or restoring.
  assetsService.registerArchiveGuard({
    name: "item-instances",
    assertCanArchive: (asset, db) => instances.assertCanArchive(asset, db),
  });

  container.dependencies.set<ItemsModuleDependencies>(ITEMS_MODULE_DEPENDENCIES, { service, instances });

  const reader = new ItemReader(service, assetsService);
  const listing = new ItemListing(service, assetsService);
  const presenter = new ItemInstancePresenter(instances, service, assetsService);
  const listInstances = new ListItemInstancesUseCase(instances, assetsService, presenter);
  const commands = instanceCommands(history, instances, presenter);
  const R = ItemRequests;
  const controller = <Input, Output>(
    parse: (request: ItemRequest) => Input,
    useCase: { execute(context: ItemRequest["requestContext"], input: Input): Promise<Output> },
  ) => new ItemController(parse, useCase);

  const controllers: ItemsRouteControllers = {
    listCampaignItems: controller(R.listCampaign, new ListCampaignItemsUseCase(listing, "MANAGE")),
    createCampaignItem: controller(R.create, new CreateItemUseCase(history, service)),
    getCampaignItem: controller(R.item, new GetItemUseCase(service, reader, "campaign")),
    updateCampaignItem: controller(R.update, new UpdateItemUseCase(history, service)),
    deleteCampaignItem: controller(R.lifecycle("query"), new ChangeItemLifecycleUseCase(history, service, true)),
    restoreCampaignItem: controller(R.lifecycle("body"), new ChangeItemLifecycleUseCase(history, service, false)),
    validateCampaignItem: controller(R.validate, new ValidateItemUseCase(service)),
    getCampaignItemUsages: controller(R.catalogItem, new GetItemUsagesUseCase(reader, service, true)),
    listItemCatalog: controller(R.listCatalog, new ListCampaignItemsUseCase(listing, "CATALOG")),
    getCatalogItem: controller(R.item, new GetItemUseCase(service, reader, "catalog")),
    getCatalogItemEffects: controller(R.catalogItem, new GetItemEffectsUseCase(reader)),
    getCatalogItemUsages: controller(R.catalogItem, new GetItemUsagesUseCase(reader, service, false)),
    listCatalogItemInstances: controller(
      R.instancesOfItem,
      new ListInstancesOfItemUseCase(service, listInstances, assetsService),
    ),
    resolveItem: controller(R.resolve, new ResolveItemUseCase(service, reader)),
    forkItem: controller(R.fork, new ForkItemUseCase(history, service, assetsService)),
    listSystemItems: controller(R.listSystem, new ListSystemItemsUseCase(listing)),
    createSystemItem: controller(R.create, new CreateItemUseCase(history, service)),
    getSystemItem: controller(R.item, new GetItemUseCase(service, reader, "system")),
    updateSystemItem: controller(R.update, new UpdateItemUseCase(history, service)),
    deleteSystemItem: controller(R.lifecycle("query"), new ChangeItemLifecycleUseCase(history, service, true)),
    restoreSystemItem: controller(R.lifecycle("body"), new ChangeItemLifecycleUseCase(history, service, false)),
    validateSystemItem: controller(R.validate, new ValidateItemUseCase(service)),

    listItemInstances: controller(R.listInstances, listInstances),
    createItemInstance: controller(R.createInstance, new CreateItemInstanceUseCase(history, instances, presenter)),
    getItemInstance: controller(R.instance, new GetItemInstanceUseCase(instances, assetsService, presenter)),
    updateItemInstance: controller(R.updateInstance, commands.update),
    deleteItemInstance: controller(R.deleteInstance, new DeleteItemInstanceUseCase(history, instances, presenter)),
    transferItemInstance: controller(R.transfer, new TransferItemInstanceUseCase(history, instances, presenter)),
    splitItemInstance: controller(R.split, new SplitItemInstanceUseCase(history, instances, presenter)),
    mergeItemInstances: controller(R.merge, new MergeItemInstancesUseCase(history, instances, presenter)),
    adjustItemInstanceQuantity: controller(R.adjustQuantity, commands.adjustQuantity),
    equipItemInstance: controller(R.equip, commands.equip),
    attuneItemInstance: controller(R.attune, commands.attune),
    spendItemInstanceCharge: controller(R.spendCharge, commands.spendCharge),
    identifyItemInstance: controller(R.identify, new IdentifyItemInstanceUseCase(history, instances, presenter)),
    resolveItemInstance: controller(
      R.resolveInstance,
      new ResolveItemInstanceUseCase(instances, service, assetsService),
    ),
  };

  app.register(async (itemsApp) => {
    registerItemsRoutes(itemsApp, controllers);
  });
}

export const itemsModule: AppModule = {
  name: "items",
  dependencies: ["system", "auth", "history", "campaigns", "assets", "asset-links", "features", "spells"],
  register: registerItemsModule,
};
