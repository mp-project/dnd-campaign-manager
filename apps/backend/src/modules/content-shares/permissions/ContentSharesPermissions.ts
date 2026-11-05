import type { PermissionDefinition } from "#core/permissions/service";

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
    description: "Read shares; players only those shared with them",
  },
  { key: CONTENT_SHARES_PERMISSIONS.create, description: "Share content; checked per campaign" },
  { key: CONTENT_SHARES_PERMISSIONS.update, description: "Change a share; checked per campaign" },
  { key: CONTENT_SHARES_PERMISSIONS.revoke, description: "End a share; checked per campaign" },
];
