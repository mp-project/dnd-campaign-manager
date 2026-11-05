export {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  assetLinksModule,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/Setup";
export { assetLinksPermissionDefinitions } from "#src/modules/asset-links/permissions/AssetLinksPermissions";
export { assetLinks } from "#src/modules/asset-links/domain/entities/AssetLinksTable";
export type { AssetLinkRow } from "#src/modules/asset-links/domain/repository/AssetLinksRepository";
export {
  CreateAssetLinkSchema,
  type CreateAssetLinkDto,
} from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
export {
  ResponseAssetUsagesSchema,
  type ResponseAssetUsagesDto,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
export type { AssetUsageItemDto } from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
export {
  AssetLinksService,
  type AssetEditRouteBuilder,
  type AssetUsageProvider,
} from "#src/modules/asset-links/service/AssetLinksService";
export type { AssetRelationDefinition } from "#src/modules/asset-links/service/AssetRelationRegistry";
