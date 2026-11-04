import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";

export const tags = pgTable(
  "tags",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 80 }).notNull(),
    /** Set by the server, so names differing only in case or spacing count as the same tag. */
    normalizedName: varchar("normalized_name", { length: 80 }).notNull(),
    color: varchar("color", { length: 9 }),
    description: varchar("description", { length: 500 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueActiveIndex(
      "tags_campaign_normalized_name_active_unique_idx",
      [table.campaignId, table.normalizedName],
      table.deletedAt,
    ),
    unique("tags_id_campaign_unique").on(table.id, table.campaignId),
    index("tags_campaign_sort_idx").on(table.campaignId, table.sortOrder, table.id),
    check("tags_sort_order_check", sql`${table.sortOrder} >= 0`),
    check("tags_normalized_name_check", sql`length(${table.normalizedName}) > 0`),
    check(
      "tags_color_check",
      sql`${table.color} is null or ${table.color} ~ '^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$'`,
    ),
  ],
);

/**
 * Assignments of tags to assets; the composite foreign keys keep all three in one campaign, so
 * global assets cannot be tagged.
 */
export const assetTags = pgTable(
  "asset_tags",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    foreignKey({
      name: "asset_tags_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    foreignKey({
      name: "asset_tags_tag_campaign_fk",
      columns: [table.tagId, table.campaignId],
      foreignColumns: [tags.id, tags.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex(
      "asset_tags_asset_tag_active_unique_idx",
      [table.assetId, table.tagId],
      table.deletedAt,
    ),
    index("asset_tags_tag_idx").on(table.tagId),
  ],
);
