import type { PermissionDefinition } from "#core/permissions/service";

export const AUTH_PERMISSIONS = {
  logoutSelf: "auth.logoutSelf",
  logoutAllSelf: "auth.logoutAllSelf",
  changePasswordSelf: "auth.changePasswordSelf",
} as const;

export const AUTH_PERMISSION_KEYS = Object.values(AUTH_PERMISSIONS);

export const AUTH_SELF_SERVICE_PERMISSION_KEYS = [...AUTH_PERMISSION_KEYS] as const;

export const authPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: AUTH_PERMISSIONS.logoutSelf,
    description: "Revoke own current refresh token",
  },
  {
    key: AUTH_PERMISSIONS.logoutAllSelf,
    description: "Revoke all own refresh tokens",
  },
  {
    key: AUTH_PERMISSIONS.changePasswordSelf,
    description: "Change own password",
  },
];
