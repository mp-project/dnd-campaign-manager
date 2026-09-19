export const campaignFactValues = ["TRUE", "FALSE", "UNKNOWN"] as const;

export type CampaignFactValue = (typeof campaignFactValues)[number];
