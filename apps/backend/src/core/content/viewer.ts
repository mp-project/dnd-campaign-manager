import type { CampaignRole } from "#core/http/requestContext";

/** What the campaigns module reports about an actor in a campaign. */
export type CampaignMembershipFacts = {
  /** Membership role; the owner is reported as `EDITOR` with `isOwner`. */
  role: "EDITOR" | "PLAYER" | null;
  isOwner: boolean;
};

/**
 * Which projection of content someone gets: everything (owner, editors, administrators) or the
 * player view. Names the projection, not a role; it is the `view` field of content responses.
 */
export type ContentView = "FULL" | "PLAYER";

/** Somebody looking at the content of one campaign. Built once per request, never by hand. */
export type ContentViewer = {
  actorId: string;
  /** System administrator; may see and change everything, also without a membership. */
  isAdmin: boolean;
  campaignId: string;
  /** Ruleset of the campaign. */
  rulesetId: string;
  /** Null for administrators without a membership. */
  campaignRole: CampaignRole | null;
  /** Derived with `contentViewOf`; kept on the viewer because every read needs it. */
  view: ContentView;
};

/** Owner, editors and administrators get the full view, players the player view. */
export function contentViewOf(input: Pick<ContentViewer, "isAdmin" | "campaignRole">): ContentView {
  return input.isAdmin || input.campaignRole === "OWNER" || input.campaignRole === "EDITOR"
    ? "FULL"
    : "PLAYER";
}

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
