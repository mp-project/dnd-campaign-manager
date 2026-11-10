export {
  ITEMS_MODULE_DEPENDENCIES,
  itemsModule,
  type ItemsModuleDependencies,
} from "#src/modules/items/Setup";
export { itemsPermissionDefinitions } from "#src/modules/items/permissions/ItemsPermissions";
export {
  itemAbilityEnum,
  itemArmorCategoryEnum,
  itemAttunementModeEnum,
  itemCapacityUnitEnum,
  itemCategoryEnum,
  itemConditionEnum,
  itemCurrencyEnum,
  itemDamageTypeEnum,
  itemDexterityModeEnum,
  itemInstanceKnowledge,
  itemInstances,
  itemKnowledgeLevelEnum,
  itemMagicTypeEnum,
  itemOwnerTypeEnum,
  itemRarityEnum,
  items,
  itemToolCategoryEnum,
  itemWeaponCategoryEnum,
  itemWeaponCombatTypeEnum,
  itemWeaponMasteryEnum,
} from "#src/modules/items/domain/entities/ItemsTable";
export type {
  ItemInstanceRow,
  ItemKnowledgeRow,
  ItemRow,
  ItemWithAsset,
} from "#src/modules/items/domain/repository/ItemsRepository";
export { resolveItem, type ResolvedItem } from "#src/modules/items/domain/ItemResolution";
export { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
export {
  type ItemInspection,
  itemCategoryProperty,
  ItemsService,
  toolCategoryProperty,
} from "#src/modules/items/service/ItemsService";
