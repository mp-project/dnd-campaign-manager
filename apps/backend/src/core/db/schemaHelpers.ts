import { isNull } from "drizzle-orm";
import {
  integer,
  timestamp,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Returns standard audit/version columns reused by most domain tables.
 *
 * @returns Shared Drizzle column definitions.
 */
export function baseColumns() {
  return {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().default(SYSTEM_USER_ID),
    updatedBy: uuid("updated_by"),
  };
}

/**
 * Produces a filter expression that keeps only non-soft-deleted rows.
 *
 * @param deletedAtColumn Column containing soft-delete timestamps.
 * @returns Drizzle expression representing active rows.
 */
export function activeOnly(deletedAtColumn: AnyPgColumn) {
  return isNull(deletedAtColumn);
}

/**
 * Builds a unique index that applies only to active (non-deleted) rows.
 *
 * @param name Index name.
 * @param columns Indexed columns.
 * @param deletedAtColumn Soft-delete marker column.
 * @returns Drizzle unique index builder.
 */
export function uniqueActiveIndex(
  name: string,
  columns: [AnyPgColumn, ...AnyPgColumn[]],
  deletedAtColumn: AnyPgColumn,
) {
  return uniqueIndex(name).on(...columns).where(activeOnly(deletedAtColumn));
}