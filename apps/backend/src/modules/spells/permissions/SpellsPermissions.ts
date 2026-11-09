import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

/** Spells and spell lists share the keys, like species and their variants. */
export const SPELLS_PERMISSIONS = {
  read: "spells.read",
  create: "spells.create",
  update: "spells.update",
  delete: "spells.delete",
  restore: "spells.restore",
  validate: "spells.validate",
  readUsages: "spells.readUsages",
  resolve: "spells.resolve",
} as const;

export const SPELLS_PERMISSION_KEYS = Object.values(SPELLS_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global spells and lists are changed by
 * administrators only, custom ones by GMs and editors of their campaign.
 */
export const SPELLS_USER_PERMISSION_KEYS = SPELLS_PERMISSION_KEYS;

export const spellsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: SPELLS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read spells and spell lists; players only active global ones and released custom ones, in the player view",
  },
  {
    key: SPELLS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create spells and spell lists; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPELLS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update spells and spell lists; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPELLS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive spells and spell lists; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPELLS_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived spells and spell lists; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPELLS_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored spell or spell list against the current state",
  },
  {
    key: SPELLS_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a spell or spell list is used in the campaign; players only for content they may see",
  },
  {
    key: SPELLS_PERMISSIONS.resolve,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Resolve a cast of a spell for a caster without spending anything; players for spells they may see",
  },
];
