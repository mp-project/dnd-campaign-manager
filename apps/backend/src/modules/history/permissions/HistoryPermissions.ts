import type { PermissionDefinition } from "#core/permissions/service";

/**
 * These keys only open the routes. Which rows and fields an actor may use is decided by
 * `access` of the tracked entity, based on the stored data.
 */
export const HISTORY_PERMISSIONS = {
  read: "history.read",
  revert: "history.revert",
  restore: "history.restore",
} as const;

export const HISTORY_PERMISSION_KEYS = Object.values(HISTORY_PERMISSIONS);

export const HISTORY_USER_PERMISSION_KEYS = [
  HISTORY_PERMISSIONS.read,
  HISTORY_PERMISSIONS.revert,
  HISTORY_PERMISSIONS.restore,
] as const;

export const historyPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: HISTORY_PERMISSIONS.read,
    description: "Read the change history of content the actor may see",
  },
  {
    key: HISTORY_PERMISSIONS.revert,
    description: "Undo changes the actor is allowed to undo",
  },
  {
    key: HISTORY_PERMISSIONS.restore,
    description: "Restore an earlier version of content the actor may restore",
  },
];
