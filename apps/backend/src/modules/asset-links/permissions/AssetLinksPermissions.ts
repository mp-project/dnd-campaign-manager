import type { PermissionDefinition } from "#core/permissions/service";

export const ASSET_LINKS_PERMISSIONS = {
  read: "assetLinks.read",
  create: "assetLinks.create",
  update: "assetLinks.update",
  delete: "assetLinks.delete",
  readUsages: "assetLinks.readUsages",
} as const;

export const ASSET_LINKS_PERMISSION_KEYS = Object.values(ASSET_LINKS_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const ASSET_LINKS_USER_PERMISSION_KEYS = ASSET_LINKS_PERMISSION_KEYS;

export const assetLinksPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: ASSET_LINKS_PERMISSIONS.read,
    description: "Read asset links; players only shared, non-secret links with visible targets",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.create,
    description: "Create links from an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.update,
    description: "Update links of an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.delete,
    description: "Delete links of an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.readUsages,
    description: "Read where an asset is used; filtered by what the viewer may see",
  },
];
