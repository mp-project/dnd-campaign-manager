import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const FEATS_PERMISSIONS = {
  read: "feats.read",
  create: "feats.create",
  update: "feats.update",
  delete: "feats.delete",
  restore: "feats.restore",
  validate: "feats.validate",
  readUsages: "feats.readUsages",
  checkEligibility: "feats.checkEligibility",
} as const;

export const FEATS_PERMISSION_KEYS = Object.values(FEATS_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global feats are changed by
 * administrators only, custom feats by GMs and editors of their campaign.
 */
export const FEATS_USER_PERMISSION_KEYS = FEATS_PERMISSION_KEYS;

export const featsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: FEATS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read feats; players only active global feats and released custom ones, in the player view",
  },
  {
    key: FEATS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create feats; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update feats; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive feats; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATS_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived feats; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATS_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored feat definition against the current state",
  },
  {
    key: FEATS_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a feat is used in the campaign; players only for feats they may see",
  },
  {
    key: FEATS_PERMISSIONS.checkEligibility,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Check a character snapshot against a feat and resolve its choices; players for feats they may see",
  },
];
