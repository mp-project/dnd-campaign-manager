// Backward-compatible re-exports.
// Source of truth for system roles lives in auth permissions.
export {
  SYSTEM_ROLE,
  SYSTEM_ROLES,
  SYS_ADMIN_ROLES,
  type SystemRole,
  isElevatedSystemRole,
  isSysAdminRole,
  isAdminRole,
} from "#src/modules/auth/permissions/systemRoles";
