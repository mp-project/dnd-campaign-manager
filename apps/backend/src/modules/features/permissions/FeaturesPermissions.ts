import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const FEATURES_PERMISSIONS = {
  read: "features.read",
  create: "features.create",
  update: "features.update",
  delete: "features.delete",
  restore: "features.restore",
  validate: "features.validate",
  readUsages: "features.readUsages",
} as const;

export const FEATURES_PERMISSION_KEYS = Object.values(FEATURES_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global features are changed by
 * administrators only, custom features by GMs and editors of their campaign.
 */
export const FEATURES_USER_PERMISSION_KEYS = FEATURES_PERMISSION_KEYS;

export const featuresPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: FEATURES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read and resolve features; players only active global features and released custom ones, in the player view",
  },
  {
    key: FEATURES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create features; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATURES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update features; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATURES_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive features; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATURES_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived features; global ones administrators only, custom ones per campaign",
  },
  {
    key: FEATURES_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored feature definition against the current state",
  },
  {
    key: FEATURES_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a custom feature is used; players only for features they may see",
  },
];
