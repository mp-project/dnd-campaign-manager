import {
  SYSTEM_ROLE,
  SYSTEM_ROLES,
  type SystemRole,
} from "#src/modules/auth/permissions/systemRoles";
import {
  ALL_PERMISSIONS,
  APPLICATION_USER_PERMISSIONS,
  type Permission,
} from "#src/modules/auth/permissions/permissions";

export type Roles = SystemRole;

const SYS_ADMIN_EXCLUDED_PERMISSIONS = new Set<Permission>(["users.manageRole"]);

export const SYS_ADMIN_COMMON_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !SYS_ADMIN_EXCLUDED_PERMISSIONS.has(permission),
);

export const ROLES: Record<Roles, readonly Permission[]> = {
  [SYSTEM_ROLE.SYSTEM]: [...ALL_PERMISSIONS],
  [SYSTEM_ROLE.SYSTEM_MAINTAINER]: [...ALL_PERMISSIONS],
  [SYSTEM_ROLE.ADMIN]: [...SYS_ADMIN_COMMON_PERMISSIONS],
  [SYSTEM_ROLE.USER]: [...APPLICATION_USER_PERMISSIONS],
};

export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = ROLES;

export function isPermissionRole(value: string): value is SystemRole {
  return SYSTEM_ROLES.some((role) => role === value);
}
