import type { PermissionDefinition } from "#core/permissions/service";

export const CAMPAIGNS_PERMISSION_KEYS = [
  "campaigns.create",
  "campaigns.read",
  "campaigns.update",
  "campaigns.archive",
  "campaigns.advanceTime",
  "campaigns.correctTime",
] as const;

export const CAMPAIGNS_USER_PERMISSION_KEYS = [
  CAMPAIGNS_PERMISSION_KEYS[0],
  CAMPAIGNS_PERMISSION_KEYS[1],
  CAMPAIGNS_PERMISSION_KEYS[2],
  CAMPAIGNS_PERMISSION_KEYS[3],
  CAMPAIGNS_PERMISSION_KEYS[4],
  CAMPAIGNS_PERMISSION_KEYS[5],
] as const;

export const campaignsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CAMPAIGNS_PERMISSION_KEYS[0],
    description: "Create own campaigns",
  },
  {
    key: CAMPAIGNS_PERMISSION_KEYS[1],
    description: "Read campaigns with membership or ownership",
  },
  {
    key: CAMPAIGNS_PERMISSION_KEYS[2],
    description: "Update campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSION_KEYS[3],
    description: "Archive campaigns in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSION_KEYS[4],
    description: "Advance campaign time in own scope",
  },
  {
    key: CAMPAIGNS_PERMISSION_KEYS[5],
    description: "Correct campaign time with explicit reason",
  },
];
