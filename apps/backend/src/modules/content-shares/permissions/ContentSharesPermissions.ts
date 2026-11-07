import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const CONTENT_SHARES_PERMISSIONS = {
  read: "contentShares.read",
  create: "contentShares.create",
  update: "contentShares.update",
  revoke: "contentShares.revoke",
} as const;

export const CONTENT_SHARES_PERMISSION_KEYS = Object.values(CONTENT_SHARES_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const CONTENT_SHARES_USER_PERMISSION_KEYS = CONTENT_SHARES_PERMISSION_KEYS;

export const contentSharesPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CONTENT_SHARES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read shares; players only those shared with them",
  },
  {
    key: CONTENT_SHARES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Share content; checked per campaign",
  },
  {
    key: CONTENT_SHARES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Change a share; checked per campaign",
  },
  {
    key: CONTENT_SHARES_PERMISSIONS.revoke,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "End a share; checked per campaign",
  },
];
