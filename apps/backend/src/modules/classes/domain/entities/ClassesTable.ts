import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";

export const CLASS_HIT_DICE = ["D6", "D8", "D10", "D12"] as const;

/** Highest class level; the DTOs and checks use the same value. */
export const CLASS_MAX_LEVEL = 20;

/** Upper bound in characters; the DTOs use the same value. */
export const CLASS_DESCRIPTION_MAX_LENGTH = 50_000;

export const classHitDieEnum = pgEnum("class_hit_die", CLASS_HIT_DICE);

/**
 * Parts of the definition, each stored as one jsonb value and validated by the DTOs. They refer to
 * each other by key (grants to choices and tracks, choices to grants and levels), so history treats
 * them, together with the level settings, as one unit.
 */
export const CLASS_DEFINITION_PARTS = [
  "primaryAbilities",
  "proficiencies",
  "startingEquipment",
  "progressionTracks",
  "levels",
  "choices",
  "spellcasting",
  "multiclass",
] as const;

const jsonArray = (name: string) => jsonb(name).notNull().default(sql`'[]'::jsonb`);

/**
 * Definition of a character class. Name, summary, status, rulesets and family belong to the asset of
 * type `CLASS`. Global classes have no campaign and are changed by administrators only; custom
 * classes belong to one campaign, which the composite foreign key keeps in line with the asset.
 * Character levels, multiclassing and decisions are stored by the actor progression, not here.
 */
export const classes = pgTable(
  "classes",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    maximumLevel: integer("maximum_level").notNull().default(CLASS_MAX_LEVEL),
    hitDie: classHitDieEnum("hit_die").notNull(),
    firstLevelHitPoints: integer("first_level_hit_points").notNull(),
    fixedHitPointsPerLevel: integer("fixed_hit_points_per_level").notNull(),
    subclassSelectionLevel: integer("subclass_selection_level").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    primaryAbilities: jsonb("primary_abilities").notNull(),
    proficiencies: jsonArray("proficiencies"),
    startingEquipment: jsonArray("starting_equipment"),
    progressionTracks: jsonArray("progression_tracks"),
    levels: jsonArray("levels"),
    choices: jsonArray("choices"),
    spellcasting: jsonb("spellcasting"),
    multiclass: jsonb("multiclass").notNull(),
  },
  (table) => [
    foreignKey({
      name: "classes_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global classes rely on the first one.
    foreignKey({
      name: "classes_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("classes_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Global classes share codes across rulesets (2014 and 2024 barbarian); the service keeps codes
    // unique per ruleset there.
    uniqueIndex("classes_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("classes_campaign_idx").on(table.campaignId),
    index("classes_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("classes_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "classes_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(CLASS_DESCRIPTION_MAX_LENGTH),
      )}`,
    ),
    check(
      "classes_levels_check",
      sql`${table.maximumLevel} between 1 and ${sql.raw(String(CLASS_MAX_LEVEL))}
        and ${table.subclassSelectionLevel} between 1 and ${table.maximumLevel}`,
    ),
    check(
      "classes_hit_points_check",
      sql`${table.firstLevelHitPoints} between 1 and 100
        and ${table.fixedHitPointsPerLevel} between 1 and 100`,
    ),
    check("classes_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "classes_definition_types_check",
      sql`jsonb_typeof(${table.primaryAbilities}) = 'object'
        and jsonb_typeof(${table.proficiencies}) = 'array'
        and jsonb_typeof(${table.startingEquipment}) = 'array'
        and jsonb_typeof(${table.progressionTracks}) = 'array'
        and jsonb_typeof(${table.levels}) = 'array'
        and jsonb_typeof(${table.choices}) = 'array'
        and (${table.spellcasting} is null or jsonb_typeof(${table.spellcasting}) = 'object')
        and jsonb_typeof(${table.multiclass}) = 'object'`,
    ),
    // One entry per level from 1 to the maximum; the DTOs check their order.
    check(
      "classes_level_count_check",
      sql`jsonb_array_length(${table.levels}) = ${table.maximumLevel}`,
    ),
  ],
);
