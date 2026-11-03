import type { PermissionDefinition } from "#core/permissions/service";

export const CAMPAIGN_INVITATION_PERMISSIONS = {
  create: "campaignInvitations.create",
  read: "campaignInvitations.read",
  revoke: "campaignInvitations.revoke",
} as const;

export const CAMPAIGN_INVITATION_PERMISSION_KEYS = Object.values(CAMPAIGN_INVITATION_PERMISSIONS);

export const campaignInvitationPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.create,
    description: "Create invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.read,
    description: "Read pending invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.revoke,
    description: "Revoke invitations for an owned campaign",
  },
];