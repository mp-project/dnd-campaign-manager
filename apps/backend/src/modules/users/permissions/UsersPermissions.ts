import type { PermissionDefinition } from "#core/permissions/service";

export const USERS_PERMISSION_KEYS = [
  "users.readSelf",
  "users.updateSelf",
  "users.read",
  "users.update",
  "users.delete",
  "users.manageRole",
] as const;

export const USERS_SELF_SERVICE_PERMISSION_KEYS = [
  USERS_PERMISSION_KEYS[0],
  USERS_PERMISSION_KEYS[1],
] as const;

export const USERS_ADMIN_PERMISSION_KEYS = [
  USERS_PERMISSION_KEYS[2],
  USERS_PERMISSION_KEYS[3],
  USERS_PERMISSION_KEYS[4],
] as const;

export const USERS_SUPER_ADMIN_PERMISSION_KEYS = [USERS_PERMISSION_KEYS[5]] as const;

export const usersPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: USERS_PERMISSION_KEYS[0],
    description: "Read own user profile",
    allowedCampaignRoles: [],
  },
  {
    key: USERS_PERMISSION_KEYS[1],
    description: "Update own user profile and settings",
    allowedCampaignRoles: [],
  },
  {
    key: USERS_PERMISSION_KEYS[2],
    description: "Read users as administrator",
    allowedCampaignRoles: [],
  },
  {
    key: USERS_PERMISSION_KEYS[3],
    description: "Update users as administrator",
    allowedCampaignRoles: [],
  },
  {
    key: USERS_PERMISSION_KEYS[4],
    description: "Delete users as administrator",
    allowedCampaignRoles: [],
  },
  {
    key: USERS_PERMISSION_KEYS[5],
    description: "Change user system roles",
    allowedCampaignRoles: [],
  },
];
