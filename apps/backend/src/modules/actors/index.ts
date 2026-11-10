export {
  ACTORS_MODULE_DEPENDENCIES,
  actorsModule,
  type ActorsModuleDependencies,
} from "#src/modules/actors/Setup";
export { actorsPermissionDefinitions } from "#src/modules/actors/permissions/ActorsPermissions";
export {
  actorAlignmentEnum,
  actorCategoryEnum,
  actorCreatureTypeEnum,
  actors,
  actorSizeEnum,
} from "#src/modules/actors/domain/entities/ActorsTable";
export type {
  ActorRow,
  ActorWithAsset,
} from "#src/modules/actors/domain/repository/ActorsRepository";
export { MEMBER_OF_RELATION } from "#src/modules/actors/domain/ActorRelations";
export { ActorsService } from "#src/modules/actors/service/ActorsService";
