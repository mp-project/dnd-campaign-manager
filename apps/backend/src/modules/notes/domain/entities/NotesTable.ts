import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { TEXT_CONTENT_FORMATS } from "../../../../core/text/contentFormat.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";

export const NOTE_TYPES = ["GM_NOTE", "HANDOUT", "LORE", "EXPLANATION", "PLAYER_SECRET"] as const;
export const NOTE_CONTENT_FORMATS = TEXT_CONTENT_FORMATS;

/** Upper bounds in characters; the DTOs use the same values. */
export const NOTE_CONTENT_MAX_LENGTH = 100_000;
export const NOTE_GM_NOTES_MAX_LENGTH = 20_000;

export const noteTypeEnum = pgEnum("note_type", NOTE_TYPES);
export const noteContentFormatEnum = pgEnum("note_content_format", NOTE_CONTENT_FORMATS);

/**
 * Text content of an asset of type `NOTE`. Name, summary and status belong to the asset. The
 * composite foreign key keeps note and asset in one campaign; a note is never global.
 */
export const notes = pgTable(
  "notes",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    noteType: noteTypeEnum("note_type").notNull(),
    contentFormat: noteContentFormatEnum("content_format").notNull().default("MARKDOWN"),
    content: text("content").notNull(),
    /** Only for GMs and editors; never part of the player view. */
    gmNotes: text("gm_notes"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    foreignKey({
      name: "notes_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("notes_asset_active_unique_idx", [table.assetId], table.deletedAt),
    index("notes_campaign_sort_idx").on(table.campaignId, table.sortOrder, table.id),
    check("notes_sort_order_check", sql`${table.sortOrder} >= 0`),
    check(
      "notes_content_length_check",
      sql`char_length(${table.content}) <= ${sql.raw(String(NOTE_CONTENT_MAX_LENGTH))}`,
    ),
    check(
      "notes_gm_notes_length_check",
      sql`${table.gmNotes} is null or char_length(${table.gmNotes}) between 1 and ${sql.raw(
        String(NOTE_GM_NOTES_MAX_LENGTH),
      )}`,
    ),
  ],
);
