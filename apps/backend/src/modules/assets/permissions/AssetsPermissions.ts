import {
  ANY_CAMPAIGN_ROLE,
  type PermissionDefinition,
} from "#core/permissions/service";

export const ASSETS_PERMISSIONS = {
  read: "assets.read",
  updateMetadata: "assets.updateMetadata",
  archive: "assets.archive",
  restore: "assets.restore",
  readCatalog: "assets.readCatalog",
} as const;

export const ASSETS_PERMISSION_KEYS = Object.values(ASSETS_PERMISSIONS);

export const ASSETS_USER_PERMISSION_KEYS = [
  ASSETS_PERMISSIONS.read,
  ASSETS_PERMISSIONS.readCatalog,
  ASSETS_PERMISSIONS.archive,
  ASSETS_PERMISSIONS.restore,
] as const;

export const assetsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: ASSETS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read asset metadata of own campaigns, shared assets or global definitions",
  },
  {
    key: ASSETS_PERMISSIONS.updateMetadata,
    description: "Update asset metadata via system administration",
  },
  {
    key: ASSETS_PERMISSIONS.archive,
    description: "Archive assets; users only in campaigns they run as GM, checked per asset",
  },
  {
    key: ASSETS_PERMISSIONS.restore,
    description: "Restore archived assets; users only in campaigns they run as GM, checked per asset",
  },
  {
    key: ASSETS_PERMISSIONS.readCatalog,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read selectable asset catalogs",
  },
];
