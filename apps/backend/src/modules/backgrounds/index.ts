export {
  BACKGROUNDS_MODULE_DEPENDENCIES,
  backgroundsModule,
  type BackgroundsModuleDependencies,
} from "#src/modules/backgrounds/Setup";
export { backgroundsPermissionDefinitions } from "#src/modules/backgrounds/permissions/BackgroundsPermissions";
export {
  backgroundCustomizationModeEnum,
  backgrounds,
} from "#src/modules/backgrounds/domain/entities/BackgroundsTable";
export type {
  BackgroundRow,
  BackgroundWithAsset,
} from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
export type { BackgroundDefinition } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
export { ResolveBackgroundSchema } from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
export { BackgroundSelectionService } from "#src/modules/backgrounds/service/BackgroundSelectionService";
export { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";
