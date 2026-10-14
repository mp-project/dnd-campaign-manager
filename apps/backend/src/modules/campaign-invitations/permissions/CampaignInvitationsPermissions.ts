import type { PermissionDefinition } from "#core/permissions/service";

export const CAMPAIGN_INVITATION_PERMISSION_KEYS = [
  "campaignInvitations.create",
  "campaignInvitations.read",
  "campaignInvitations.revoke",
] as const;

export const campaignInvitationPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGN_INVITATION_PERMISSION_KEYS[0],
    description: "Create invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSION_KEYS[1],
    description: "Read pending invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSION_KEYS[2],
    description: "Revoke invitations for an owned campaign",
  },
];