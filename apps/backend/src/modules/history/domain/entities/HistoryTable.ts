import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const entityChangeEvents = pgTable(
  "entity_change_events",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    seq: bigserial("seq", { mode: "number" }).notNull(),
    actionId: uuid("action_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityVersion: integer("entity_version").notNull(),
    campaignId: uuid("campaign_id"),
    rootType: text("root_type"),
    rootId: uuid("root_id"),
    actorId: uuid("actor_id"),
    reason: text("reason"),
    revertible: boolean("revertible").notNull().default(true),
    revertsEventId: uuid("reverts_event_id"),
    restoredFromVersion: integer("restored_from_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entity_change_events_entity_version_unique_idx").on(
      table.entityType,
      table.entityId,
      table.entityVersion,
    ),
    index("entity_change_events_seq_idx").on(table.seq),
    index("entity_change_events_action_id_idx").on(table.actionId),
    index("entity_change_events_root_idx").on(table.rootType, table.rootId, table.seq),
    index("entity_change_events_campaign_idx").on(table.campaignId, table.seq),
    index("entity_change_events_reverts_idx")
      .on(table.revertsEventId)
      .where(sql`${table.revertsEventId} is not null`),
  ],
);

export const entityChangeFields = pgTable(
  "entity_change_fields",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => entityChangeEvents.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    entityVersion: integer("entity_version").notNull(),
    field: text("field").notNull(),
    kind: text("kind").notNull(),
    newValue: jsonb("new_value"),
    delta: doublePrecision("delta"),
    isBaseline: boolean("is_baseline").notNull().default(false),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.field] }),
    index("entity_change_fields_lookup_idx").on(
      table.entityType,
      table.entityId,
      table.field,
      table.entityVersion,
    ),
  ],
);

export const entityHistoryHorizons = pgTable(
  "entity_history_horizons",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    trimmedThroughVersion: integer("trimmed_through_version").notNull(),
  },
  (table) => [primaryKey({ columns: [table.entityType, table.entityId, table.field] })],
);

export const historyIdempotencyKeys = pgTable(
  "history_idempotency_keys",
  {
    actorId: uuid("actor_id").notNull(),
    key: text("key").notNull(),
    actionId: uuid("action_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.key] })],
);
