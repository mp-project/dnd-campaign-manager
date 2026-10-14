import type { PermissionDefinition } from "#core/permissions/service";

export const CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS = [
  "campaignMembers.read",
  "campaignMembers.invite",
  "campaignMembers.updateRole",
  "campaignMembers.revoke",
] as const;

export const CAMPAIGN_MEMBERSHIP_USER_PERMISSION_KEYS = [
  ...CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
] as const;

export const campaignMembershipPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[0],
    description: "Read active members of an accessible campaign",
  },
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[1],
    description: "Invite users to a campaign",
  },
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[2],
    description: "Change campaign membership roles",
  },
  {
    key: CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS[3],
    description: "Revoke campaign memberships",
  },
];
