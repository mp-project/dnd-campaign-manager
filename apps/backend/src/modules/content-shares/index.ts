export {
  CONTENT_SHARES_MODULE_DEPENDENCIES,
  contentSharesModule,
  type ContentSharesModuleDependencies,
} from "#src/modules/content-shares/Setup";
export { contentSharesPermissionDefinitions } from "#src/modules/content-shares/permissions/ContentSharesPermissions";
export {
  contentShareAudienceEnum,
  contentShareRecipients,
  contentShares,
} from "#src/modules/content-shares/domain/entities/ContentSharesTable";
export {
  ContentSharesService,
} from "#src/modules/content-shares/service/ContentSharesService";
