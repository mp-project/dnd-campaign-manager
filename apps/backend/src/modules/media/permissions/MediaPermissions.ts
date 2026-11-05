import type { PermissionDefinition } from "#core/permissions/service";

export const MEDIA_PERMISSIONS = {
  read: "media.read",
  upload: "media.upload",
  update: "media.update",
  delete: "media.delete",
  attach: "media.attach",
} as const;

export const MEDIA_PERMISSION_KEYS = Object.values(MEDIA_PERMISSIONS);

/** Whether a user may do this in a campaign is decided by the campaign role in the use case. */
export const MEDIA_USER_PERMISSION_KEYS = MEDIA_PERMISSION_KEYS;

export const mediaPermissionDefinitions: readonly PermissionDefinition[] = [
  {
    key: MEDIA_PERMISSIONS.read,
    description: "Read media; players only what is attached for them to assets they may see",
  },
  { key: MEDIA_PERMISSIONS.upload, description: "Upload files; checked per campaign" },
  { key: MEDIA_PERMISSIONS.update, description: "Update assignments; checked per campaign" },
  {
    key: MEDIA_PERMISSIONS.delete,
    description: "Delete unused files; checked per campaign, global files only for administrators",
  },
  {
    key: MEDIA_PERMISSIONS.attach,
    description: "Attach files to assets and detach them; checked per campaign",
  },
];
