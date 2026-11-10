import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { classes } from "../../../classes/domain/entities/ClassesTable.js";

/** Upper bound in characters; the DTOs use the same value. */
export const SUBCLASS_DESCRIPTION_MAX_LENGTH = 50_000;

/**
 * Parts of the definition, each stored as one jsonb value and validated by the DTOs. They refer to
 * each other by key (grants to choices and tracks, choices to grants), so history treats them as
 * one unit.
 */
export const SUBCLASS_DEFINITION_PARTS = [
  "levels",
  "progressionTracks",
  "choices",
  "spellcasting",
  "spellGrants",
] as const;

const jsonArray = (name: string) => jsonb(name).notNull().default(sql`'[]'::jsonb`);

/**
 * Definition of a subclass (Path of the Berserker, Champion, Life Domain …). Name, summary, status
 * and rulesets belong to the asset of type `SUBCLASS`. A subclass names its class; the level it is
 * chosen at and the maximum level come from the class, so they are not stored here. Global
 * subclasses belong to global classes; custom ones to one campaign, for its own classes or for
 * global ones (the service keeps that, since a global class has no campaign to compare). Which
 * subclass a character took is stored by the actor progression, per class assignment.
 */
export const subclasses = pgTable(
  "subclasses",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "restrict" }),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    levels: jsonArray("levels"),
    progressionTracks: jsonArray("progression_tracks"),
    choices: jsonArray("choices"),
    spellcasting: jsonb("spellcasting"),
    spellGrants: jsonArray("spell_grants"),
  },
  (table) => [
    foreignKey({
      name: "subclasses_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global subclasses rely on the first.
    foreignKey({
      name: "subclasses_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("subclasses_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Codes are unique per class: among the global subclasses, and per campaign among custom ones
    // (a campaign may add a `champion` of its own next to the global one).
    uniqueIndex("subclasses_system_class_code_active_unique_idx")
      .on(table.classId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    uniqueIndex("subclasses_campaign_class_code_active_unique_idx")
      .on(table.campaignId, table.classId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("subclasses_class_idx").on(table.classId),
    index("subclasses_campaign_idx").on(table.campaignId),
    check("subclasses_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "subclasses_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(SUBCLASS_DESCRIPTION_MAX_LENGTH),
      )}`,
    ),
    check("subclasses_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "subclasses_definition_types_check",
      sql`jsonb_typeof(${table.levels}) = 'array'
        and jsonb_typeof(${table.progressionTracks}) = 'array'
        and jsonb_typeof(${table.choices}) = 'array'
        and (${table.spellcasting} is null or jsonb_typeof(${table.spellcasting}) = 'object')
        and jsonb_typeof(${table.spellGrants}) = 'array'`,
    ),
  ],
);
