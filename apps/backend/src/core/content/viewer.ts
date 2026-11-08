import type { CampaignRole } from "#core/http/requestContext";

/** What the campaigns module reports about an actor in a campaign. */
export type CampaignMembershipFacts = {
  /** Membership role; the owner is reported as `EDITOR` with `isOwner`. */
  role: "EDITOR" | "PLAYER" | null;
  isOwner: boolean;
};

/**
 * The one role model for campaign content: the owner leads the game (Spielleitung), editors help
 * with the content, players play. Null when the actor does not belong to the campaign.
 */
export function campaignRoleOf(facts: CampaignMembershipFacts | null): CampaignRole | null {
  if (!facts) {
    return null;
  }

  return facts.isOwner ? "OWNER" : facts.role;
}
