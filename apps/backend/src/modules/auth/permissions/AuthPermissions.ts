import type { PermissionDefinition } from "#core/permissions/service";

export const AUTH_PERMISSION_KEYS = [
  "auth.logoutSelf",
  "auth.logoutAllSelf",
  "auth.changePasswordSelf",
] as const;

export const AUTH_SELF_SERVICE_PERMISSION_KEYS = [...AUTH_PERMISSION_KEYS] as const;

export const authPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: AUTH_PERMISSION_KEYS[0],
    description: "Revoke own current refresh token",
    allowedCampaignRoles: [],
  },
  {
    key: AUTH_PERMISSION_KEYS[1],
    description: "Revoke all own refresh tokens",
    allowedCampaignRoles: [],
  },
  {
    key: AUTH_PERMISSION_KEYS[2],
    description: "Change own password",
    allowedCampaignRoles: [],
  },
];
