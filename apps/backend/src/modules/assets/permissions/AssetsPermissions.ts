import type { PermissionDefinition } from "#core/permissions/service";

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
] as const;

export const assetsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: ASSETS_PERMISSIONS.read,
    description: "Read asset metadata of own campaigns, shared assets or global definitions",
  },
  {
    key: ASSETS_PERMISSIONS.updateMetadata,
    description: "Update asset metadata via system administration",
  },
  {
    key: ASSETS_PERMISSIONS.archive,
    description: "Archive asset definitions via system administration",
  },
  {
    key: ASSETS_PERMISSIONS.restore,
    description: "Restore archived asset definitions via system administration",
  },
  {
    key: ASSETS_PERMISSIONS.readCatalog,
    description: "Read selectable asset catalogs",
  },
];
