export const CAMPAIGNS_HTTP_PREFIX = "/campaigns";

export const CAMPAIGNS_HTTP_SECURITY = [{ cookieAuth: [] }] as const;

export const CAMPAIGNS_HTTP_PATHS = {
  collection: "/",
  item: "/:campaignId",
  advanceTime: "/:campaignId/time/advance",
  correctTime: "/:campaignId/time/correct",
  timeHistory: "/:campaignId/time/history",
} as const;

export const CAMPAIGNS_HTTP_PERMISSIONS = {
  create: "campaigns.create",
  read: "campaigns.read",
  update: "campaigns.update",
  archive: "campaigns.archive",
  advanceTime: "campaigns.advanceTime",
  correctTime: "campaigns.correctTime",
} as const;

export const CAMPAIGNS_HTTP_RATE_LIMITS = {
  read: {
    max: 200,
    timeWindow: "1 minute",
  },
  write: {
    max: 60,
    timeWindow: "1 minute",
  },
} as const;
