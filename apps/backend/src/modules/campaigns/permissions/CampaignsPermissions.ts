import type { PermissionDefinition } from "#core/permissions/service";

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
    description: "Read campaigns with membership or ownership",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.update,
    description: "Update campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.archive,
    description: "Archive campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.advanceTime,
    description: "Advance campaign time in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSIONS.correctTime,
    description: "Correct campaign time with explicit reason",
  },
];
