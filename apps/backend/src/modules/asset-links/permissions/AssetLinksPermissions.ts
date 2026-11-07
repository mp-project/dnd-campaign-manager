import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

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
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read asset links; players only shared, non-secret links with visible targets",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create links from an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update links of an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Delete links of an asset; checked per campaign",
  },
  {
    key: ASSET_LINKS_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read where an asset is used; filtered by what the viewer may see",
  },
];
