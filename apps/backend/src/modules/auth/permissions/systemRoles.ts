export const SYSTEM_ROLE = {
  SYSTEM: "SYSTEM",
  SYSTEM_MAINTAINER: "SYSTEM_MAINTAINER",
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export const SYSTEM_ROLES = [
  SYSTEM_ROLE.SYSTEM,
  SYSTEM_ROLE.SYSTEM_MAINTAINER,
  SYSTEM_ROLE.ADMIN,
  SYSTEM_ROLE.USER,
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const SYS_ADMIN_ROLES = [
  SYSTEM_ROLE.SYSTEM,
  SYSTEM_ROLE.SYSTEM_MAINTAINER,
  SYSTEM_ROLE.ADMIN,
] as const;

export function isElevatedSystemRole(role: SystemRole): boolean {
  return role === SYSTEM_ROLE.SYSTEM || role === SYSTEM_ROLE.SYSTEM_MAINTAINER;
}

export function isSysAdminRole(role: SystemRole): boolean {
  return (
    role === SYSTEM_ROLE.SYSTEM ||
    role === SYSTEM_ROLE.SYSTEM_MAINTAINER ||
    role === SYSTEM_ROLE.ADMIN
  );
}

export function isAdminRole(role: SystemRole): boolean {
  return role === SYSTEM_ROLE.ADMIN;
}