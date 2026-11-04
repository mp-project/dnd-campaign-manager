import type { AppDatabase } from "#core/db/pool";
import type { HistoryAccess } from "#core/history/types";

export type CampaignHistoryRole = "GM" | "EDITOR" | "PLAYER";

type CampaignHistoryAccessOptions<Row> = {
  campaignId(row: Row): string;
  /** Current role of the actor; null when the actor no longer belongs to the campaign. */
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
  /** Players only see rows this allows. Without it they see nothing. */
  visibleToPlayer?(row: Row, actorId: string, db: AppDatabase): boolean | Promise<boolean>;
  /** Players only undo their own actions on rows this allows. Without it they undo nothing. */
  ownedByPlayer?(row: Row, actorId: string): boolean;
  hiddenFromPlayers?: readonly string[];
};

/**
 * Standard rights for campaign content. They use the role at access time, so a removed member
 * loses access to old entries as well.
 *
 * - GM: read, undo everything, restore versions
 * - Editor: read, undo everything, no restore
 * - Player: visible rows without hidden fields, undo own actions on own rows
 */
export function campaignHistoryAccess<Row>(
  options: CampaignHistoryAccessOptions<Row>,
): HistoryAccess<Row> {
  const hidden = new Set(options.hiddenFromPlayers ?? []);

  const roleOf = async (actorId: string | null, row: Row, db: AppDatabase) =>
    actorId ? options.resolveRole(options.campaignId(row), actorId, db) : null;

  return {
    read: async (context, row, db) => {
      const role = await roleOf(context.actorId, row, db);

      if (!role || !context.actorId) {
        return false;
      }

      if (role !== "PLAYER") {
        return true;
      }

      return (await options.visibleToPlayer?.(row, context.actorId, db)) ?? false;
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

      if (role !== "PLAYER") {
        return true;
      }

      return (
        change.actorId === context.actorId &&
        change.fields.every((field) => !hidden.has(field)) &&
        (options.ownedByPlayer?.(row, context.actorId) ?? false)
      );
    },
    restore: async (context, row, db) =>
      (await roleOf(context.actorId, row, db)) === "GM",
  };
}
