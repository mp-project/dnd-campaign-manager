import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_OWNER_ROLE,
  type PermissionDefinition,
} from "#core/permissions/service";

export const CAMPAIGNS_PERMISSIONS = {
  create: "campaigns.create",
  read: "campaigns.read",
  update: "campaigns.update",
  archive: "campaigns.archive",
  advanceTime: "campaigns.advanceTime",
  correctTime: "campaigns.correctTime",
} as const;

export const CAMPAIGNS_PERMISSION_KEYS = Object.values(CAMPAIGNS_PERMISSIONS);

export const CAMPAIGNS_USER_PERMISSION_KEYS = [
  CAMPAIGNS_PERMISSIONS.create,
  CAMPAIGNS_PERMISSIONS.read,
  CAMPAIGNS_PERMISSIONS.update,
  CAMPAIGNS_PERMISSIONS.archive,
  CAMPAIGNS_PERMISSIONS.advanceTime,
  CAMPAIGNS_PERMISSIONS.correctTime,
] as const;

export const campaignsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGNS_PERMISSIONS.create,
    description: "Create own campaigns",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read campaigns with membership or ownership",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Update campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.archive,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Archive campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.advanceTime,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Advance campaign time in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.correctTime,
    campaignRoles: CAMPAIGN_OWNER_ROLE,
    campaignRoleDenial: "notFound",
    description: "Correct campaign time with explicit reason",
  },
];
