import type { SystemRole } from "#core/permissions/roles";

export type { SystemRole } from "#core/permissions/roles";

export type RequestContext = {
  actorId: string | null;
  systemRole: SystemRole;
};

export type CampaignContext = RequestContext & {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
  permissions: string[];
};
