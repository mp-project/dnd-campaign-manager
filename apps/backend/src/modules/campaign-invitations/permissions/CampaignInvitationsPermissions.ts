import {
  CAMPAIGN_OWNER_ROLE,
  type PermissionDefinition,
} from "#core/permissions/service";

export const CAMPAIGN_INVITATION_PERMISSIONS = {
  create: "campaignInvitations.create",
  read: "campaignInvitations.read",
  revoke: "campaignInvitations.revoke",
  accept: "campaignInvitations.accept",
} as const;

export const CAMPAIGN_INVITATION_PERMISSION_KEYS = Object.values(CAMPAIGN_INVITATION_PERMISSIONS);

export const campaignInvitationPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Create invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.read,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Read pending invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.revoke,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Revoke invitations for an owned campaign",
  },
  {
    key: CAMPAIGN_INVITATION_PERMISSIONS.accept,
    description: "Accept an invitation addressed to the own account",
  },
];
