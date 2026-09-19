import type { CampaignRole, SystemRole } from "#core/permissions/roles";

export type { CampaignRole, SystemRole } from "#core/permissions/roles";

export type RequestContext = {
  actorId: string | null;
  systemRole: SystemRole;
};

export type CampaignContext = RequestContext & {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
  campaignRole: CampaignRole | null;
  permissions: string[];
};
