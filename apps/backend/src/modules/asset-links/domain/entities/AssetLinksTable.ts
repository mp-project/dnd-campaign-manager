import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";

/**
 * Directed, typed relation between two assets. The source always belongs to the campaign, which the
 * composite foreign key guarantees. The target may also be a global asset, so its campaign is
 * checked by the service.
 */
export const assetLinks = pgTable(
  "asset_links",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    sourceAssetId: uuid("source_asset_id").notNull(),
    targetAssetId: uuid("target_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    relationType: varchar("relation_type", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    /** Copied from the relation when the link is created, so the unique index can use it. */
    allowMultiple: boolean("allow_multiple").notNull().default(false),
  },
  (table) => [
    foreignKey({
      name: "asset_links_source_campaign_fk",
      columns: [table.sourceAssetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueIndex("asset_links_active_unique_idx")
      .on(table.campaignId, table.sourceAssetId, table.targetAssetId, table.relationType)
      .where(sql`${table.deletedAt} is null and ${table.allowMultiple} = false`),
    index("asset_links_source_idx").on(table.campaignId, table.sourceAssetId, table.sortOrder),
    index("asset_links_target_idx").on(table.targetAssetId, table.campaignId),
    check("asset_links_sort_order_check", sql`${table.sortOrder} >= 0`),
    check("asset_links_metadata_object_check", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  ],
);
