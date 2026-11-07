import type { SystemRole } from "#core/permissions/roles";

export type { SystemRole } from "#core/permissions/roles";

export type RequestContext = {
  actorId: string | null;
  systemRole: SystemRole;
};

/**
 * Role of the actor in a campaign; the owner counts as OWNER even without a membership row.
 */
export type CampaignRole = "OWNER" | "EDITOR" | "PLAYER";

export type CampaignContext = RequestContext & {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
  /** Set for campaign-scoped requests; null for non-members, absent for the global context. */
  campaignRole?: CampaignRole | null;
  permissions: string[];
};
