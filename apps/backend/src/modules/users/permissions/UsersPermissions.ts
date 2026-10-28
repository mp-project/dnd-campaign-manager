import type { PermissionDefinition } from "#core/permissions/service";

export const USERS_PERMISSIONS = {
  readSelf: "users.readSelf",
  updateSelf: "users.updateSelf",
  read: "users.read",
  update: "users.update",
  delete: "users.delete",
  manageRole: "users.manageRole",
} as const;

export const USERS_PERMISSION_KEYS = Object.values(USERS_PERMISSIONS);

export const USERS_SELF_SERVICE_PERMISSION_KEYS = [
  USERS_PERMISSIONS.readSelf,
  USERS_PERMISSIONS.updateSelf,
] as const;

export const USERS_ADMIN_PERMISSION_KEYS = [
  USERS_PERMISSIONS.read,
  USERS_PERMISSIONS.update,
  USERS_PERMISSIONS.delete,
] as const;

export const USERS_SYSTEM_MAINTAINER_PERMISSION_KEYS = [USERS_PERMISSIONS.manageRole] as const;

export const usersPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: USERS_PERMISSIONS.readSelf,
    description: "Read own user profile",
  },
  {
    key: USERS_PERMISSIONS.updateSelf,
    description: "Update own user profile and settings",
  },
  {
    key: USERS_PERMISSIONS.read,
    description: "Read users as administrator",
  },
  {
    key: USERS_PERMISSIONS.update,
    description: "Update users as administrator",
  },
  {
    key: USERS_PERMISSIONS.delete,
    description: "Delete users as administrator",
  },
  {
    key: USERS_PERMISSIONS.manageRole,
    description: "Change user system roles",
  },
];
