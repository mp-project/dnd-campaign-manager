import type { CampaignRole } from "#core/http/requestContext";

/**
 * What somebody wants to do with content beyond reading it.
 *
 * - `EDIT`: create and change content, its links, tags, media and releases.
 * - `CHANGE_LIFECYCLE`: archive and restore.
 * - `SHARE`: reveal content to players.
 * - `READ_HISTORY`, `REVERT`: read and undo the history of content. The history only exists for
 *   people who may change the content, so these follow `EDIT`.
 * - `RESTORE_VERSION`: go back to an older version as a whole; only the owner, who leads the game.
 */
export type ContentWriteAction =
  | "EDIT"
  | "CHANGE_LIFECYCLE"
  | "SHARE"
  | "READ_HISTORY"
  | "REVERT"
  | "RESTORE_VERSION";

export type ContentWriteDecision = "ALLOWED" | "FORBIDDEN" | "NOT_FOUND";

/**
 * The one rule who may change content. Administrators may do everything. Global content
 * (`campaignId` null) belongs to administrators only. Campaign content may be changed by its owner
 * and editors; anybody outside the campaign does not learn it exists (`NOT_FOUND`), players get
 * `FORBIDDEN`. Restoring old versions is left to the owner.
 */
export function decideContentWrite(
  actor: { isAdmin: boolean; campaignRole: CampaignRole | null },
  action: ContentWriteAction,
  target: { campaignId: string | null },
): ContentWriteDecision {
  if (actor.isAdmin) {
    return "ALLOWED";
  }

  if (target.campaignId === null) {
    return "FORBIDDEN";
  }

  if (actor.campaignRole === null) {
    return "NOT_FOUND";
  }

  if (action === "RESTORE_VERSION") {
    return actor.campaignRole === "OWNER" ? "ALLOWED" : "FORBIDDEN";
  }

  return actor.campaignRole === "OWNER" || actor.campaignRole === "EDITOR"
    ? "ALLOWED"
    : "FORBIDDEN";
}
