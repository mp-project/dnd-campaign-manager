export const SYSTEM_ROLE = {
  SYSTEM: "SYSTEM",
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export const CAMPAIGN_ROLE = {
  EDITOR: "EDITOR",
  PLAYER: "PLAYER",
} as const;

export const SYSTEM_ROLES = [
  SYSTEM_ROLE.SYSTEM,
  SYSTEM_ROLE.SUPER_ADMIN,
  SYSTEM_ROLE.ADMIN,
  SYSTEM_ROLE.USER,
] as const;

export const ELEVATED_SYSTEM_ROLES = [
  SYSTEM_ROLE.SYSTEM,
  SYSTEM_ROLE.SUPER_ADMIN,
  SYSTEM_ROLE.ADMIN,
] as const;

export const CAMPAIGN_ROLES = [
  CAMPAIGN_ROLE.EDITOR,
  CAMPAIGN_ROLE.PLAYER,
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];
export type CampaignRole = (typeof CAMPAIGN_ROLES)[number];

export function isElevatedSystemRole(role: SystemRole): boolean {
  return (
    role === SYSTEM_ROLE.SYSTEM ||
    role === SYSTEM_ROLE.SUPER_ADMIN ||
    role === SYSTEM_ROLE.ADMIN
  );
}

export function isAdminRole(role: SystemRole): boolean {
  return role === SYSTEM_ROLE.ADMIN;
}

export function isSuperAdminRole(role: SystemRole): boolean {
  return role === SYSTEM_ROLE.SUPER_ADMIN;
}
