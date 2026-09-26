export const USERS_HTTP_PREFIX = "";

export const USERS_HTTP_SECURITY = [
  { cookieAuth: [] },
] as const;

export const USERS_HTTP_PATHS = {
  me: "/me",
  meSettings: "/me/settings",
  meCampaigns: "/me/campaigns",
  meInvitations: "/me/invitations",
  adminCollection: "/admin/users",
  adminItem: "/admin/users/:userId",
} as const;

export const USERS_HTTP_PERMISSIONS = {
  readSelf: "users.readSelf",
  updateSelf: "users.updateSelf",
  readAdmin: "users.read",
  updateAdmin: "users.update",
  deleteAdmin: "users.delete",
} as const;

export const USERS_HTTP_RATE_LIMITS = {
  read: {
    max: 200,
    timeWindow: "1 minute",
  },
  write: {
    max: 60,
    timeWindow: "1 minute",
  },
} as const;
