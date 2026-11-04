export {
  TAGS_MODULE_DEPENDENCIES,
  tagsModule,
  type TagsModuleDependencies,
} from "#src/modules/tags/Setup";
export { tagsPermissionDefinitions } from "#src/modules/tags/permissions/TagsPermissions";
export { assetTags, tags } from "#src/modules/tags/domain/entities/TagsTable";
export type { TagRow } from "#src/modules/tags/domain/repository/TagsRepository";
export { TagsService } from "#src/modules/tags/service/TagsService";
