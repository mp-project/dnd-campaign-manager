import { SYSTEM_ROLE, type SystemRole } from "#core/permissions/roles";
import {
  ALL_PERMISSIONS,
  APPLICATION_USER_PERMISSIONS,
  type Permission,
} from "#src/modules/auth/permissions/permissions";

const ADMIN_EXCLUDED_PERMISSIONS = new Set<Permission>(["users.manageRole"]);
const ADMIN_PERMISSIONS = ALL_PERMISSIONS.filter(
  (permission) => !ADMIN_EXCLUDED_PERMISSIONS.has(permission),
);

export const ROLE_PERMISSIONS: Record<SystemRole, readonly Permission[]> = {
  [SYSTEM_ROLE.SYSTEM]: [...ALL_PERMISSIONS],
  [SYSTEM_ROLE.SUPER_ADMIN]: [...ALL_PERMISSIONS],
  [SYSTEM_ROLE.ADMIN]: [...ADMIN_PERMISSIONS],
  [SYSTEM_ROLE.USER]: [...APPLICATION_USER_PERMISSIONS],
};
