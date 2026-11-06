export {
  FEATURES_MODULE_DEPENDENCIES,
  featuresModule,
  type FeaturesModuleDependencies,
} from "#src/modules/features/Setup";
export { featuresPermissionDefinitions } from "#src/modules/features/permissions/FeaturesPermissions";
export {
  features,
  featureStackingModeEnum,
  featureTypeEnum,
} from "#src/modules/features/domain/entities/FeaturesTable";
export type {
  FeatureRow,
  FeatureWithAsset,
} from "#src/modules/features/domain/repository/FeaturesRepository";
export type {
  ActorSnapshot,
  EvaluatedEffects,
  FeatureBindings,
  ResolvedFeatureGraph,
} from "#src/modules/features/domain/FeatureResolver";
export { FeaturesService } from "#src/modules/features/service/FeaturesService";
