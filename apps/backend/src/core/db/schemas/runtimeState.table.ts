import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../schemaHelpers.js";

export const systemRuntimeState = pgTable(
  "system_runtime_state",
  {
    ...baseColumns(),
    stateKey: text("state_key").notNull(),
    value: jsonb("value")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueActiveIndex(
      "system_runtime_state_state_key_active_unique_idx",
      [table.stateKey],
      table.deletedAt,
    ),
  ],
);

export const campaignRuntimeState = pgTable(
  "campaign_runtime_state",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").notNull(),
    stateKey: text("state_key").notNull(),
    value: jsonb("value")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueActiveIndex(
      "campaign_runtime_state_campaign_key_active_unique_idx",
      [table.campaignId, table.stateKey],
      table.deletedAt,
    ),
  ],
);

export type SystemRuntimeState = typeof systemRuntimeState.$inferSelect;
export type CampaignRuntimeState = typeof campaignRuntimeState.$inferSelect;
