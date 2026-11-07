import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const CLASSES_PERMISSIONS = {
  read: "classes.read",
  create: "classes.create",
  update: "classes.update",
  delete: "classes.delete",
  restore: "classes.restore",
  validate: "classes.validate",
  readUsages: "classes.readUsages",
} as const;

export const CLASSES_PERMISSION_KEYS = Object.values(CLASSES_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global classes are changed by
 * administrators only, custom classes by GMs and editors of their campaign.
 */
export const CLASSES_USER_PERMISSION_KEYS = CLASSES_PERMISSION_KEYS;

export const classesPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: CLASSES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read classes; players only active global classes and released custom ones, in the player view",
  },
  {
    key: CLASSES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create classes; global ones administrators only, custom ones per campaign",
  },
  {
    key: CLASSES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update classes; global ones administrators only, custom ones per campaign",
  },
  {
    key: CLASSES_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive classes; global ones administrators only, custom ones per campaign",
  },
  {
    key: CLASSES_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived classes; global ones administrators only, custom ones per campaign",
  },
  {
    key: CLASSES_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored class definition against the current state",
  },
  {
    key: CLASSES_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a class is used in the campaign; players only for classes they may see",
  },
];
