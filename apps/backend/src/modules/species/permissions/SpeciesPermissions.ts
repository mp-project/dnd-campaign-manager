import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

/** Species and their variants share the keys; variants are only reachable through their species. */
export const SPECIES_PERMISSIONS = {
  read: "species.read",
  create: "species.create",
  update: "species.update",
  delete: "species.delete",
  restore: "species.restore",
  validate: "species.validate",
  readUsages: "species.readUsages",
} as const;

export const SPECIES_PERMISSION_KEYS = Object.values(SPECIES_PERMISSIONS);

/**
 * Whether a user may do this is decided in the use case: global species are changed by
 * administrators only, custom species by GMs and editors of their campaign.
 */
export const SPECIES_USER_PERMISSION_KEYS = SPECIES_PERMISSION_KEYS;

export const speciesPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: SPECIES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description:
      "Read species and variants and resolve a selection; players only active global ones and released custom ones, in the player view",
  },
  {
    key: SPECIES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create species and variants; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPECIES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update species and variants; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPECIES_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive species and variants; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPECIES_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description:
      "Restore archived species and variants; global ones administrators only, custom ones per campaign",
  },
  {
    key: SPECIES_PERMISSIONS.validate,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Check a stored species or variant against the current state",
  },
  {
    key: SPECIES_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a species is used in the campaign; players only for species they may see",
  },
];
