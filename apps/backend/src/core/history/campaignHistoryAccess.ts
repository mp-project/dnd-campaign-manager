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
  /** Roles that may change every row of this entity. Defaults to owner and editor. */
  editRoles?: readonly Exclude<CampaignRole, "PLAYER">[];
  /** Rows a player may change. Without it, players have no history of this entity. */
  ownedByPlayer?(row: Row, actorId: string): boolean;
  hiddenFromPlayers?: readonly string[];
};

const DEFAULT_EDIT_ROLES = ["OWNER", "EDITOR"] as const;

/**
 * Standard rights for campaign content. The history only exists for people who may change the
 * content, so seeing a row is not enough to read its history. Rights use the role at access time,
 * so a removed member loses access to old entries as well.
 *
 * - Roles in `editRoles`: read, undo everything
 * - Owner: also restore versions
 * - Player: own rows without hidden fields, undo own actions on them
 */
export function campaignHistoryAccess<Row>(
  options: CampaignHistoryAccessOptions<Row>,
): HistoryAccess<Row> {
  const hidden = new Set(options.hiddenFromPlayers ?? []);
  const editRoles: readonly CampaignRole[] = options.editRoles ?? DEFAULT_EDIT_ROLES;

  const roleOf = async (actorId: string | null, row: Row, db: AppDatabase) =>
    actorId ? options.resolveRole(options.campaignId(row), actorId, db) : null;

  return {
    read: async (context, row, db) => {
      const role = await roleOf(context.actorId, row, db);

      if (!role || !context.actorId) {
        return false;
      }

      return (
        editRoles.includes(role) ||
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

      if (editRoles.includes(role)) {
        return true;
      }

      return (
        role === "PLAYER" &&
        change.actorId === context.actorId &&
        change.fields.every((field) => !hidden.has(field)) &&
        (options.ownedByPlayer?.(row, context.actorId) ?? false)
      );
    },
    restore: async (context, row, db) =>
      (await roleOf(context.actorId, row, db)) === "OWNER",
  };
}
