import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const ACTORS_PERMISSIONS = {
  read: "actors.read",
  readStatBlock: "actors.readStatBlock",
  create: "actors.create",
  update: "actors.update",
  delete: "actors.delete",
  restore: "actors.restore",
  readUsages: "actors.readUsages",
} as const;

export const ACTORS_PERMISSION_KEYS = Object.values(ACTORS_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const ACTORS_USER_PERMISSION_KEYS = ACTORS_PERMISSION_KEYS;

export const actorsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: ACTORS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read actors; players only active actors shared with them, in the player view",
  },
  {
    key: ACTORS_PERMISSIONS.readStatBlock,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    campaignRoleDenial: "notFound",
    description: "Read the computed stat block of an actor; players get their own character's later",
  },
  {
    key: ACTORS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create characters, NPCs and monsters; checked per campaign",
  },
  {
    key: ACTORS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update actors, including their category; checked per campaign",
  },
  {
    key: ACTORS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive actors; checked per campaign",
  },
  {
    key: ACTORS_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived actors; checked per campaign",
  },
  {
    key: ACTORS_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where an actor is used; players only for actors shared with them",
  },
];
