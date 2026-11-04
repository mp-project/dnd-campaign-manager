export type CampaignStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type CampaignRole = "EDITOR" | "PLAYER";
export type Campaign = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  ownerUserId: string;
  rulesetId: string;
  name: string;
  slug: string;
  description: string | null;
  status: CampaignStatus;
  currentGameDay: number;
  longRestCount: number;
  settings: Record<string, unknown>;
  campaignRole: CampaignRole | null;
  isOwner: boolean;
  effectivePermissions: string[];
};

export type CampaignCounterChange = {
  previous: number;
  next: number;
};

/** One change of the campaign time, built from the entries of the campaign history. */
export type CampaignTimeEntry = {
  id: string;
  action: string;
  gameDay: CampaignCounterChange | null;
  longRests: CampaignCounterChange | null;
  reason: string | null;
  createdAt: string;
};

export type ListResponse<T> = {
  data: T[];
  pageInfo: {
    limit: number;
    nextCursor: string | null;
    total?: number;
  };
};

export type CreateCampaignInput = {
  name: string;
  slug?: string;
  description?: string | null;
  rulesetId: string;
  settings?: Record<string, unknown>;
};

export type UpdateCampaignInput = {
  expectedVersion: number;
  name?: string;
  slug?: string;
  description?: string | null;
  status?: CampaignStatus;
  settings?: Record<string, unknown>;
};

export type AdvanceCampaignTimeInput = {
  days: number;
  longRests: number;
  reason?: string | null;
};

export type CorrectCampaignTimeInput = {
  gameDay: number;
  longRestCount: number;
  reason: string;
};
