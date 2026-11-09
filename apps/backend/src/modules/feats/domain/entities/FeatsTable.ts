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

/**
 * Feat categories of the rulesets. 2014 knows none, so its feats are `GENERAL`; 2024 adds origin
 * feats, fighting styles and epic boons. Which ones a ruleset allows is `FEAT_CATEGORY_PROFILES`.
 */
export const FEAT_CATEGORIES = ["ORIGIN", "GENERAL", "FIGHTING_STYLE", "EPIC_BOON"] as const;

/** `CONTINUOUS`: the character loses the benefits while a prerequisite is no longer met. */
export const PREREQUISITE_CHECK_MODES = ["ON_ACQUISITION", "CONTINUOUS"] as const;

/** Highest character level; the DTOs and checks use the same value. */
export const FEAT_MAX_CHARACTER_LEVEL = 20;

/** Upper bound in characters; the DTOs use the same value. */
export const FEAT_DESCRIPTION_MAX_LENGTH = 50_000;

export const featCategoryEnum = pgEnum("feat_category", FEAT_CATEGORIES);
export const featPrerequisiteCheckModeEnum = pgEnum(
  "feat_prerequisite_check_mode",
  PREREQUISITE_CHECK_MODES,
);

/**
 * Parts of the definition, each stored as one jsonb value and validated by the DTOs. They refer to
 * each other by key (repeatability to a choice, bindings to choices), so history treats them as
 * one unit.
 */
export const FEAT_DEFINITION_PARTS = [
  "prerequisites",
  "repeatability",
  "choices",
  "featureGrants",
] as const;

/**
 * Definition of a feat. Name, summary, status, rulesets and source belong to the asset of type
 * `FEAT`. Global feats have no campaign and are changed by administrators only; custom feats
 * belong to one campaign, which the composite foreign key keeps in line with the asset. Which
 * character took a feat, and with which choices, is stored by the character modules.
 */
export const feats = pgTable(
  "feats",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    category: featCategoryEnum("category").notNull(),
    minimumCharacterLevel: integer("minimum_character_level"),
    prerequisiteCheckMode: featPrerequisiteCheckModeEnum("prerequisite_check_mode")
      .notNull()
      .default("ON_ACQUISITION"),
    displayOrder: integer("display_order").notNull().default(0),
    /** Tree of prerequisite nodes; null when the feat has none. */
    prerequisites: jsonb("prerequisites"),
    repeatability: jsonb("repeatability").notNull(),
    choices: jsonb("choices").notNull().default(sql`'[]'::jsonb`),
    featureGrants: jsonb("feature_grants").notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    foreignKey({
      name: "feats_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global feats rely on the first one.
    foreignKey({
      name: "feats_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("feats_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Global feats share codes across rulesets (2014 and 2024 Alert); the service keeps codes
    // unique per ruleset there.
    uniqueIndex("feats_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("feats_campaign_idx").on(table.campaignId),
    index("feats_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("feats_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "feats_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(FEAT_DESCRIPTION_MAX_LENGTH),
      )}`,
    ),
    check(
      "feats_minimum_level_check",
      sql`${table.minimumCharacterLevel} is null or ${table.minimumCharacterLevel} between 1 and ${sql.raw(
        String(FEAT_MAX_CHARACTER_LEVEL),
      )}`,
    ),
    check("feats_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "feats_definition_types_check",
      sql`(${table.prerequisites} is null or jsonb_typeof(${table.prerequisites}) = 'object')
        and jsonb_typeof(${table.repeatability}) = 'object'
        and jsonb_typeof(${table.choices}) = 'array'
        and jsonb_typeof(${table.featureGrants}) = 'array'`,
    ),
  ],
);
