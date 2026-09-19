export const RULESET_HTTP_PREFIX = "/ruleset";

export const RULESET_HTTP_SECURITY = [
  { cookieAuth: [] },
] as const;

export const RULESET_HTTP_PATHS = {
  collection: "/",
  item: "/:rulesetId",
  validate: "/:rulesetId/validate",
} as const;

export const RULESET_HTTP_PERMISSIONS = {
  list: "rulesets.read",
  getById: "rulesets.read",
  create: "rulesets.create",
  update: "rulesets.update",
  delete: "rulesets.delete",
  validate: "rulesets.validate",
} as const;

export const RULESET_HTTP_RATE_LIMITS = {
  read: {
    max: 200,
    timeWindow: "1 minute",
  },
  write: {
    max: 60,
    timeWindow: "1 minute",
  },
} as const;
