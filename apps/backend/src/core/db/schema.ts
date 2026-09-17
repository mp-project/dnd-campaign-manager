import { isNull, sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const systemRuntimeState = pgTable(
  "system_runtime_state",
  {
    id: uuid("id").primaryKey().notNull(),
    stateKey: text("state_key").notNull(),
    value: jsonb("value")
      .notNull()
      .default(sql`'{}'::jsonb`),
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
  },
  (table) => [
    uniqueIndex("system_runtime_state_state_key_active_unique_idx")
      .on(table.stateKey)
      .where(isNull(table.deletedAt)),
  ],
);

export type SystemRuntimeState = typeof systemRuntimeState.$inferSelect;
