import { isNull } from "drizzle-orm";
import {
  integer,
  timestamp,
  type AnyPgColumn,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    createdBy: uuid("created_by"),
    updatedBy: uuid("updated_by"),
  };
}

export function activeOnly(deletedAtColumn: AnyPgColumn) {
  return isNull(deletedAtColumn);
}

export function uniqueActiveIndex(
  name: string,
  columns: [AnyPgColumn, ...AnyPgColumn[]],
  deletedAtColumn: AnyPgColumn,
) {
  return uniqueIndex(name).on(...columns).where(activeOnly(deletedAtColumn));
}