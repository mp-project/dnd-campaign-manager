import {
  ANY_CAMPAIGN_ROLE,
  CAMPAIGN_EDITOR_ROLES,
  type PermissionDefinition,
} from "#core/permissions/service";

export const TAGS_PERMISSIONS = {
  read: "tags.read",
  create: "tags.create",
  update: "tags.update",
  delete: "tags.delete",
  assign: "tags.assign",
} as const;

export const TAGS_PERMISSION_KEYS = Object.values(TAGS_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const TAGS_USER_PERMISSION_KEYS = TAGS_PERMISSION_KEYS;

export const tagsPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: TAGS_PERMISSIONS.read,
    campaignRoles: ANY_CAMPAIGN_ROLE,
    description: "Read tags; players only tags of assets they may see",
  },
  {
    key: TAGS_PERMISSIONS.create,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Create tags; checked per campaign",
  },
  {
    key: TAGS_PERMISSIONS.update,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Update tags; checked per campaign",
  },
  {
    key: TAGS_PERMISSIONS.delete,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Delete tags; checked per campaign",
  },
  {
    key: TAGS_PERMISSIONS.assign,
    campaignRoles: CAMPAIGN_EDITOR_ROLES,
    description: "Assign tags to assets; checked per campaign",
  },
];
