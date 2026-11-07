import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const NOTES_PERMISSIONS = {
  read: "notes.read",
  create: "notes.create",
  update: "notes.update",
  delete: "notes.delete",
  restore: "notes.restore",
  readUsages: "notes.readUsages",
} as const;

export const NOTES_PERMISSION_KEYS = Object.values(NOTES_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const NOTES_USER_PERMISSION_KEYS = NOTES_PERMISSION_KEYS;

export const notesPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: NOTES_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read notes; players only active notes shared with them, in the player view",
  },
  {
    key: NOTES_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create notes; checked per campaign",
  },
  {
    key: NOTES_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update notes; checked per campaign",
  },
  {
    key: NOTES_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Archive notes; checked per campaign",
  },
  {
    key: NOTES_PERMISSIONS.restore,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Restore archived notes; checked per campaign",
  },
  {
    key: NOTES_PERMISSIONS.readUsages,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "See where a note is used; players only for notes shared with them",
  },
];
