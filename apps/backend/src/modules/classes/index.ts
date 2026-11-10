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
export {
  CHOICE_ASSET_TYPES,
  type ClassChoice,
  ClassChoiceSchema,
  ClassChoiceViewSchema,
  type ClassDefinition,
  type FeatureGrant,
  FeatureGrantSchema,
  PREPARATION_MODES,
  type ProgressionTrack,
  ProgressionTrackSchema,
  RITUAL_MODES,
  ROUNDING_MODES,
  SpellcastingLevelSchema,
} from "#src/modules/classes/domain/dto/ClassDefinitionDto";
export {
  boundAssetIds,
  type DefinitionIssue,
  stripHiddenGrants,
} from "#src/modules/classes/domain/ClassDefinition";
export { CLASS_MAX_LEVEL, CLASS_DESCRIPTION_MAX_LENGTH } from "#src/modules/classes/domain/entities/ClassesTable";
export { parseClassDefinition } from "#src/modules/classes/history/TrackedClass";
export { expectedAssetVersionDto } from "#src/modules/classes/domain/dto/UpdateClassDto";
export * as ClassViews from "#src/modules/classes/domain/ClassViews";
export { ClassesService } from "#src/modules/classes/service/ClassesService";
