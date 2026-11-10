import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const BACKGROUNDS_PERMISSIONS = {
  read: "backgrounds.read",
  create: "backgrounds.create",
  update: "backgrounds.update",
  delete: "backgrounds.delete",
  restore: "backgrounds.restore",
  validate: "backgrounds.validate",
  readUsages: "backgrounds.readUsages",
  resolve: "backgrounds.resolve",
} as const;

export const BACKGROUNDS_PERMISSION_KEYS = Object.values(BACKGROUNDS_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global backgrounds are changed by
 * administrators only, custom backgrounds by GMs and editors of their campaign.
 */
export const BACKGROUNDS_USER_PERMISSION_KEYS = BACKGROUNDS_PERMISSION_KEYS;

export const backgroundsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: BACKGROUNDS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read backgrounds; players only active global backgrounds and released custom ones, in the player view",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create backgrounds; global ones administrators only, custom ones per campaign",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update backgrounds; global ones administrators only, custom ones per campaign",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive backgrounds; global ones administrators only, custom ones per campaign",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived backgrounds; global ones administrators only, custom ones per campaign",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored background definition against the current state",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a background is used in the campaign; players only for backgrounds they may see",
  },
  {
    key: BACKGROUNDS_PERMISSIONS.resolve,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Check a character's background choices and preview what the background gives; players for backgrounds they may see",
  },
];
