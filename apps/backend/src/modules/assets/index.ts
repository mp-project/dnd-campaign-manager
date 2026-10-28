export { assetsModule } from "#src/modules/assets/Setup";
export {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/Setup";
export { assetsPermissionDefinitions } from "#src/modules/assets/permissions/AssetsPermissions";
export {
  ASSET_TYPES,
  assetFamilies,
  assetOriginEnum,
  assetRulesetPolicyEnum,
  assetRulesets,
  assetScopeEnum,
  assetStatusEnum,
  assets,
  assetTypeEnum,
} from "#src/modules/assets/domain/entities/AssetsTable";
export type {
  AssetRecord,
  AssetRow,
} from "#src/modules/assets/domain/repository/AssetsRepository";
export type { CreateAssetBaseDto } from "#src/modules/assets/domain/dto/CreateAssetDto";
export type { AssetType } from "#src/modules/assets/domain/dto/BaseAssetDto";
export {
  AssetsService,
  type AssetVisibilityProvider,
} from "#src/modules/assets/service/AssetsService";
