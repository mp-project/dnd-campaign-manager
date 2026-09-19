import type { PermissionDefinition } from "#core/permissions/service";
import {
  ELEVATED_SYSTEM_ROLES,
  SYSTEM_ROLE,
  SYSTEM_ROLES,
} from "#core/permissions/roles";

export const usersPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: "users.readSelf",
    description: "Read own user profile",
    allowedSystemRoles: SYSTEM_ROLES,
    allowedCampaignRoles: [],
  },
  {
    key: "users.updateSelf",
    description: "Update own user profile and settings",
    allowedSystemRoles: SYSTEM_ROLES,
    allowedCampaignRoles: [],
  },
  {
    key: "users.read",
    description: "Read users as administrator",
    allowedSystemRoles: ELEVATED_SYSTEM_ROLES,
    allowedCampaignRoles: [],
  },
  {
    key: "users.update",
    description: "Update users as administrator",
    allowedSystemRoles: ELEVATED_SYSTEM_ROLES,
    allowedCampaignRoles: [],
  },
  {
    key: "users.delete",
    description: "Delete users as administrator",
    allowedSystemRoles: ELEVATED_SYSTEM_ROLES,
    allowedCampaignRoles: [],
  },
  {
    key: "users.manageRole",
    description: "Change user system roles",
    allowedSystemRoles: [SYSTEM_ROLE.SUPER_ADMIN],
    allowedCampaignRoles: [],
  },
];
