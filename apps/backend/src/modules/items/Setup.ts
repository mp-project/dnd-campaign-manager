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
import { AdjustItemQuantityController } from "#src/modules/items/http/controller/AdjustItemQuantityController";
import { AttuneItemInstanceController } from "#src/modules/items/http/controller/AttuneItemInstanceController";
import { CreateItemController } from "#src/modules/items/http/controller/CreateItemController";
import { CreateItemInstanceController } from "#src/modules/items/http/controller/CreateItemInstanceController";
import { DeleteItemController } from "#src/modules/items/http/controller/DeleteItemController";
import { DeleteItemInstanceController } from "#src/modules/items/http/controller/DeleteItemInstanceController";
import { EquipItemInstanceController } from "#src/modules/items/http/controller/EquipItemInstanceController";
import { ForkItemController } from "#src/modules/items/http/controller/ForkItemController";
import { GetItemController } from "#src/modules/items/http/controller/GetItemController";
import { GetItemEffectsController } from "#src/modules/items/http/controller/GetItemEffectsController";
import { GetItemInstanceController } from "#src/modules/items/http/controller/GetItemInstanceController";
import { GetItemUsagesController } from "#src/modules/items/http/controller/GetItemUsagesController";
import { IdentifyItemInstanceController } from "#src/modules/items/http/controller/IdentifyItemInstanceController";
import { ListCampaignItemsController } from "#src/modules/items/http/controller/ListCampaignItemsController";
import { ListInstancesOfItemController } from "#src/modules/items/http/controller/ListInstancesOfItemController";
import { ListItemCatalogController } from "#src/modules/items/http/controller/ListItemCatalogController";
import { ListItemInstancesController } from "#src/modules/items/http/controller/ListItemInstancesController";
import { ListSystemItemsController } from "#src/modules/items/http/controller/ListSystemItemsController";
import { MergeItemInstancesController } from "#src/modules/items/http/controller/MergeItemInstancesController";
import { ResolveItemController } from "#src/modules/items/http/controller/ResolveItemController";
import { ResolveItemInstanceController } from "#src/modules/items/http/controller/ResolveItemInstanceController";
import { RestoreItemController } from "#src/modules/items/http/controller/RestoreItemController";
import { SpendItemChargeController } from "#src/modules/items/http/controller/SpendItemChargeController";
import { SplitItemInstanceController } from "#src/modules/items/http/controller/SplitItemInstanceController";
import { TransferItemInstanceController } from "#src/modules/items/http/controller/TransferItemInstanceController";
import { UpdateItemController } from "#src/modules/items/http/controller/UpdateItemController";
import { UpdateItemInstanceController } from "#src/modules/items/http/controller/UpdateItemInstanceController";
import { ValidateItemController } from "#src/modules/items/http/controller/ValidateItemController";
import { type ItemsRouteControllers, registerItemsRoutes } from "#src/modules/items/http/routes/v1/ItemsRoutes";
import { itemsPermissionDefinitions } from "#src/modules/items/permissions/ItemsPermissions";
import { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import { type ItemCampaignAccessPort, ItemsService } from "#src/modules/items/service/ItemsService";
import { AdjustItemQuantityUseCase } from "#src/modules/items/useCase/AdjustItemQuantityUseCase";
import { AttuneItemInstanceUseCase } from "#src/modules/items/useCase/AttuneItemInstanceUseCase";
import { CreateItemInstanceUseCase } from "#src/modules/items/useCase/CreateItemInstanceUseCase";
import { CreateItemUseCase } from "#src/modules/items/useCase/CreateItemUseCase";
import { DeleteItemInstanceUseCase } from "#src/modules/items/useCase/DeleteItemInstanceUseCase";
import { DeleteItemUseCase } from "#src/modules/items/useCase/DeleteItemUseCase";
import { EquipItemInstanceUseCase } from "#src/modules/items/useCase/EquipItemInstanceUseCase";
import { ForkItemUseCase } from "#src/modules/items/useCase/ForkItemUseCase";
import { GetItemEffectsUseCase } from "#src/modules/items/useCase/GetItemEffectsUseCase";
import { GetItemInstanceUseCase } from "#src/modules/items/useCase/GetItemInstanceUseCase";
import { GetItemUsagesUseCase } from "#src/modules/items/useCase/GetItemUsagesUseCase";
import { GetItemUseCase } from "#src/modules/items/useCase/GetItemUseCase";
import { IdentifyItemInstanceUseCase } from "#src/modules/items/useCase/IdentifyItemInstanceUseCase";
import { ItemInstancePresenter } from "#src/modules/items/useCase/ItemInstancePresenter";
import { ItemListing } from "#src/modules/items/useCase/ItemListing";
import { ItemReader } from "#src/modules/items/useCase/ItemReader";
import { ListCampaignItemsUseCase } from "#src/modules/items/useCase/ListCampaignItemsUseCase";
import { ListInstancesOfItemUseCase } from "#src/modules/items/useCase/ListInstancesOfItemUseCase";
import { ListItemCatalogUseCase } from "#src/modules/items/useCase/ListItemCatalogUseCase";
import { ListItemInstancesUseCase } from "#src/modules/items/useCase/ListItemInstancesUseCase";
import { ListSystemItemsUseCase } from "#src/modules/items/useCase/ListSystemItemsUseCase";
import { MergeItemInstancesUseCase } from "#src/modules/items/useCase/MergeItemInstancesUseCase";
import { ResolveItemInstanceUseCase } from "#src/modules/items/useCase/ResolveItemInstanceUseCase";
import { ResolveItemUseCase } from "#src/modules/items/useCase/ResolveItemUseCase";
import { RestoreItemUseCase } from "#src/modules/items/useCase/RestoreItemUseCase";
import { SpendItemChargeUseCase } from "#src/modules/items/useCase/SpendItemChargeUseCase";
import { SplitItemInstanceUseCase } from "#src/modules/items/useCase/SplitItemInstanceUseCase";
import { TransferItemInstanceUseCase } from "#src/modules/items/useCase/TransferItemInstanceUseCase";
import { UpdateItemInstanceUseCase } from "#src/modules/items/useCase/UpdateItemInstanceUseCase";
import { UpdateItemUseCase } from "#src/modules/items/useCase/UpdateItemUseCase";
import { ValidateItemUseCase } from "#src/modules/items/useCase/ValidateItemUseCase";
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
    properties: (asset, db) => service.listContentProperties(asset, db),
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
  const controllers: ItemsRouteControllers = {
    listCampaignItems: new ListCampaignItemsController(new ListCampaignItemsUseCase(listing)),
    createCampaignItem: new CreateItemController(new CreateItemUseCase(history, service)),
    getCampaignItem: new GetItemController(new GetItemUseCase(service, reader, "campaign")),
    updateCampaignItem: new UpdateItemController(new UpdateItemUseCase(history, service)),
    deleteCampaignItem: new DeleteItemController(new DeleteItemUseCase(history, service)),
    restoreCampaignItem: new RestoreItemController(new RestoreItemUseCase(history, service)),
    validateCampaignItem: new ValidateItemController(new ValidateItemUseCase(service)),
    getCampaignItemUsages: new GetItemUsagesController(new GetItemUsagesUseCase(reader, service, true)),
    listItemCatalog: new ListItemCatalogController(new ListItemCatalogUseCase(listing)),
    getCatalogItem: new GetItemController(new GetItemUseCase(service, reader, "catalog")),
    getCatalogItemEffects: new GetItemEffectsController(new GetItemEffectsUseCase(reader)),
    getCatalogItemUsages: new GetItemUsagesController(new GetItemUsagesUseCase(reader, service, false)),
    listCatalogItemInstances: new ListInstancesOfItemController(
      new ListInstancesOfItemUseCase(service, listInstances, assetsService),
    ),
    resolveItem: new ResolveItemController(new ResolveItemUseCase(service, reader)),
    forkItem: new ForkItemController(new ForkItemUseCase(history, service, assetsService)),
    listSystemItems: new ListSystemItemsController(new ListSystemItemsUseCase(listing)),
    createSystemItem: new CreateItemController(new CreateItemUseCase(history, service)),
    getSystemItem: new GetItemController(new GetItemUseCase(service, reader, "system")),
    updateSystemItem: new UpdateItemController(new UpdateItemUseCase(history, service)),
    deleteSystemItem: new DeleteItemController(new DeleteItemUseCase(history, service)),
    restoreSystemItem: new RestoreItemController(new RestoreItemUseCase(history, service)),
    validateSystemItem: new ValidateItemController(new ValidateItemUseCase(service)),

    listItemInstances: new ListItemInstancesController(listInstances),
    createItemInstance: new CreateItemInstanceController(new CreateItemInstanceUseCase(history, instances, presenter)),
    getItemInstance: new GetItemInstanceController(new GetItemInstanceUseCase(instances, assetsService, presenter)),
    updateItemInstance: new UpdateItemInstanceController(new UpdateItemInstanceUseCase(history, instances, presenter)),
    deleteItemInstance: new DeleteItemInstanceController(new DeleteItemInstanceUseCase(history, instances, presenter)),
    transferItemInstance: new TransferItemInstanceController(
      new TransferItemInstanceUseCase(history, instances, presenter),
    ),
    splitItemInstance: new SplitItemInstanceController(new SplitItemInstanceUseCase(history, instances, presenter)),
    mergeItemInstances: new MergeItemInstancesController(new MergeItemInstancesUseCase(history, instances, presenter)),
    adjustItemInstanceQuantity: new AdjustItemQuantityController(
      new AdjustItemQuantityUseCase(history, instances, presenter),
    ),
    equipItemInstance: new EquipItemInstanceController(new EquipItemInstanceUseCase(history, instances, presenter)),
    attuneItemInstance: new AttuneItemInstanceController(new AttuneItemInstanceUseCase(history, instances, presenter)),
    spendItemInstanceCharge: new SpendItemChargeController(new SpendItemChargeUseCase(history, instances, presenter)),
    identifyItemInstance: new IdentifyItemInstanceController(
      new IdentifyItemInstanceUseCase(history, instances, presenter),
    ),
    resolveItemInstance: new ResolveItemInstanceController(
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
