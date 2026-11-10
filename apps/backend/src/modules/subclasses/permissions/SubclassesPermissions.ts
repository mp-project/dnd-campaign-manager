import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const SUBCLASSES_PERMISSIONS = {
  read: "subclasses.read",
  create: "subclasses.create",
  update: "subclasses.update",
  delete: "subclasses.delete",
  restore: "subclasses.restore",
  validate: "subclasses.validate",
  readUsages: "subclasses.readUsages",
} as const;

export const SUBCLASSES_PERMISSION_KEYS = Object.values(SUBCLASSES_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global subclasses are changed by
 * administrators only, custom subclasses by GMs and editors of their campaign.
 */
export const SUBCLASSES_USER_PERMISSION_KEYS = SUBCLASSES_PERMISSION_KEYS;

export const subclassesPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: SUBCLASSES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read subclasses and check a selection; players only active global subclasses and released custom ones of classes they may see, in the player view",
  },
  {
    key: SUBCLASSES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create subclasses; global ones administrators only, custom ones per campaign",
  },
  {
    key: SUBCLASSES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update subclasses; global ones administrators only, custom ones per campaign",
  },
  {
    key: SUBCLASSES_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive subclasses; global ones administrators only, custom ones per campaign",
  },
  {
    key: SUBCLASSES_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description:
      "Restore archived subclasses; global ones administrators only, custom ones per campaign",
  },
  {
    key: SUBCLASSES_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored subclass definition against its class and the current state",
  },
  {
    key: SUBCLASSES_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "See where a subclass is used in the campaign; players only for subclasses they may see",
  },
];
