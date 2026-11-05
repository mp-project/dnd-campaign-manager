export {
  MEDIA_MODULE_DEPENDENCIES,
  mediaModule,
  type MediaModuleDependencies,
} from "#src/modules/media/Setup";
export { mediaPermissionDefinitions } from "#src/modules/media/permissions/MediaPermissions";
export { assetMedia, mediaFiles } from "#src/modules/media/domain/entities/MediaTable";
export type {
  AssetMediaRow,
  MediaFileRow,
} from "#src/modules/media/domain/repository/MediaRepository";
export type {
  MediaLimitOverrides,
  MediaLimitsProvider,
} from "#src/modules/media/domain/MediaLimits";
export { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
export { MediaService } from "#src/modules/media/service/MediaService";
