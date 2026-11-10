export {
  SUBCLASSES_MODULE_DEPENDENCIES,
  subclassesModule,
  type SubclassesModuleDependencies,
} from "#src/modules/subclasses/Setup";
export { subclassesPermissionDefinitions } from "#src/modules/subclasses/permissions/SubclassesPermissions";
export { subclasses } from "#src/modules/subclasses/domain/entities/SubclassesTable";
export type {
  SubclassRow,
  SubclassWithAsset,
} from "#src/modules/subclasses/domain/repository/SubclassesRepository";
export type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
export * as SubclassViews from "#src/modules/subclasses/domain/SubclassViews";
export {
  type SubclassSelectionInput,
  type SubclassSelectionResult,
  SubclassesService,
} from "#src/modules/subclasses/service/SubclassesService";
