import { type ContentWriteAction, decideContentWrite } from "#core/content/writeAccess";
import type { AppDatabase } from "#core/db/pool";
import type { HistoryAccess } from "#core/history/types";
import type { CampaignRole } from "#core/http/requestContext";

type CampaignHistoryAccessOptions<Row> = {
  campaignId(row: Row): string;
  /** Current role of the actor; null when the actor no longer belongs to the campaign. */
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
  /**
   * Only for campaign settings, which only the owner changes: roles that may read and undo every
   * row. Campaign content leaves it out; its rights come from `decideContentWrite`.
   */
  editRoles?: readonly Exclude<CampaignRole, "PLAYER">[];
  /** Rows a player may change. Without it, players have no history of this entity. */
  ownedByPlayer?(row: Row, actorId: string): boolean;
  hiddenFromPlayers?: readonly string[];
};

/**
 * Standard rights for campaign content. The history only exists for people who may change the
 * content, so seeing a row is not enough to read its history: reading and undoing follow
 * `decideContentWrite` (owner and editors), restoring a version is left to the owner. Rights use
 * the role at access time, so a removed member loses access to old entries as well. Players read
 * and undo their own rows (`ownedByPlayer`) without hidden fields.
 */
export function campaignHistoryAccess<Row>(
  options: CampaignHistoryAccessOptions<Row>,
): HistoryAccess<Row> {
  const hidden = new Set(options.hiddenFromPlayers ?? []);
  const allows = (role: CampaignRole, action: ContentWriteAction, row: Row): boolean => {
    if (options.editRoles) {
      return action === "RESTORE_VERSION"
        ? role === "OWNER"
        : (options.editRoles as readonly CampaignRole[]).includes(role);
    }

    const target = { campaignId: options.campaignId(row) };

    return decideContentWrite({ isAdmin: false, campaignRole: role }, action, target) === "ALLOWED";
  };

  const roleOf = async (actorId: string | null, row: Row, db: AppDatabase) =>
    actorId ? options.resolveRole(options.campaignId(row), actorId, db) : null;

  return {
    read: async (context, row, db) => {
      const role = await roleOf(context.actorId, row, db);

      if (!role || !context.actorId) {
        return false;
      }

      return (
        allows(role, "READ_HISTORY", row) ||
        (role === "PLAYER" && (options.ownedByPlayer?.(row, context.actorId) ?? false))
      );
    },
    readField: async (context, row, field, db) => {
      const role = await roleOf(context.actorId, row, db);

      return role !== null && (role !== "PLAYER" || !hidden.has(field));
    },
    revert: async (context, row, change, db) => {
      const role = await roleOf(context.actorId, row, db);

      if (!role || !context.actorId) {
        return false;
      }

      if (allows(role, "REVERT", row)) {
        return true;
      }

      return (
        role === "PLAYER" &&
        change.actorId === context.actorId &&
        change.fields.every((field) => !hidden.has(field)) &&
        (options.ownedByPlayer?.(row, context.actorId) ?? false)
      );
    },
    restore: async (context, row, db) => {
      const role = await roleOf(context.actorId, row, db);

      return role !== null && allows(role, "RESTORE_VERSION", row);
    },
  };
}
