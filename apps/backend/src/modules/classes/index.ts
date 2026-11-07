export {
  CLASSES_MODULE_DEPENDENCIES,
  classesModule,
  type ClassesModuleDependencies,
} from "#src/modules/classes/Setup";
export { classesPermissionDefinitions } from "#src/modules/classes/permissions/ClassesPermissions";
export { classes, classHitDieEnum } from "#src/modules/classes/domain/entities/ClassesTable";
export type {
  ClassRow,
  ClassWithAsset,
} from "#src/modules/classes/domain/repository/ClassesRepository";
export type { ClassDefinition } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
export * as ClassViews from "#src/modules/classes/domain/ClassViews";
export { ClassesService } from "#src/modules/classes/service/ClassesService";
