import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const CAMPAIGN_MEMBERSHIP_PERMISSIONS = {
  read: "campaignMembers.read",
  updateRole: "campaignMembers.updateRole",
  revoke: "campaignMembers.revoke",
} as const;

export const CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS = Object.values(CAMPAIGN_MEMBERSHIP_PERMISSIONS);

export const CAMPAIGN_MEMBERSHIP_USER_PERMISSION_KEYS = [
  ...CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
] as const;

export const campaignMembershipPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read active members of an accessible campaign",
  },
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.updateRole,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    campaignRoleDenial: "notFound",
    description: "Change campaign membership roles",
  },
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSIONS.revoke,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    campaignRoleDenial: "notFound",
    description: "Revoke campaign memberships",
  },
];
