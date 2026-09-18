export type SystemRole = "ADMIN" | "USER";

export type CampaignRole = "EDITOR" | "PLAYER";

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
