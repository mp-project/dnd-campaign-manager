export const campaignFactValues = ["TRUE", "FALSE", "UNKNOWN"] as const;

export type CampaignFactValue = (typeof campaignFactValues)[number];

export type CampaignFactPort = {
  hasVisitedLocation(input: {
    campaignId: string;
    actorId: string | null;
    locationId: string;
  }): Promise<CampaignFactValue>;
  hasMetNpc(input: {
    campaignId: string;
    actorId: string | null;
    npcId: string;
  }): Promise<CampaignFactValue>;
  hasResolvedEncounter(input: {
    campaignId: string;
    actorId: string | null;
    encounterId: string;
  }): Promise<CampaignFactValue>;
  isQuestCompleted(input: {
    campaignId: string;
    actorId: string | null;
    questId: string;
  }): Promise<CampaignFactValue>;
};

/**
 * Returns a conservative campaign-fact port that answers UNKNOWN for all facts.
 *
 * @returns Campaign fact port for safe default behavior.
 */
export function createUnknownCampaignFactPort(): CampaignFactPort {
  return {
    hasVisitedLocation: async () => "UNKNOWN",
    hasMetNpc: async () => "UNKNOWN",
    hasResolvedEncounter: async () => "UNKNOWN",
    isQuestCompleted: async () => "UNKNOWN",
  };
}
