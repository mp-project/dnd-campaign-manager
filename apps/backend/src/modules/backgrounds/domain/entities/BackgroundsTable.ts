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
 * `FIXED`: the background is taken as written. `RULESET_CUSTOMIZABLE`: the 2014 rule "Customizing
 * a Background" applies (other skills, tools and languages, the feature of another background); the
 * customization belongs to the character, not to the background.
 */
export const BACKGROUND_CUSTOMIZATION_MODES = ["FIXED", "RULESET_CUSTOMIZABLE"] as const;

/** Upper bound in characters; the DTOs use the same value. */
export const BACKGROUND_DESCRIPTION_MAX_LENGTH = 50_000;

export const backgroundCustomizationModeEnum = pgEnum(
  "background_customization_mode",
  BACKGROUND_CUSTOMIZATION_MODES,
);

/**
 * Parts of the definition, each stored as one jsonb value and validated by the DTOs. They are
 * checked together (unique keys across parts, the edition rules of the ability rule and the
 * customization mode), so history treats them as one unit.
 */
export const BACKGROUND_DEFINITION_PARTS = [
  "sections",
  "abilityRule",
  "proficiencyGrants",
  "featGrants",
  "featureGrants",
  "equipmentOptions",
  "promptTables",
] as const;

const jsonArray = (name: string) => jsonb(name).notNull().default(sql`'[]'::jsonb`);

/**
 * Definition of a background (Acolyte, Sage, Soldier …). Name, summary, status, rulesets and
 * source belong to the asset of type `BACKGROUND`. Global backgrounds have no campaign and are
 * changed by administrators only; custom backgrounds belong to one campaign, which the composite
 * foreign key keeps in line with the asset. Which background a character took, with its choices,
 * is stored by the character modules; the definition is never copied into a character.
 */
export const backgrounds = pgTable(
  "backgrounds",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    customizationMode: backgroundCustomizationModeEnum("customization_mode")
      .notNull()
      .default("FIXED"),
    displayOrder: integer("display_order").notNull().default(0),
    sections: jsonArray("sections"),
    abilityRule: jsonb("ability_rule").notNull().default(sql`'{"mode":"NONE"}'::jsonb`),
    proficiencyGrants: jsonArray("proficiency_grants"),
    featGrants: jsonArray("feat_grants"),
    featureGrants: jsonArray("feature_grants"),
    equipmentOptions: jsonArray("equipment_options"),
    promptTables: jsonArray("prompt_tables"),
  },
  (table) => [
    foreignKey({
      name: "backgrounds_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global backgrounds rely on the first.
    foreignKey({
      name: "backgrounds_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("backgrounds_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Global backgrounds share codes across rulesets (2014 and 2024 Acolyte); the service keeps
    // codes unique per ruleset there.
    uniqueIndex("backgrounds_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("backgrounds_campaign_idx").on(table.campaignId),
    index("backgrounds_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("backgrounds_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "backgrounds_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(BACKGROUND_DESCRIPTION_MAX_LENGTH),
      )}`,
    ),
    check("backgrounds_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "backgrounds_ability_rule_mode_check",
      sql`${table.abilityRule} ->> 'mode' in ('NONE', 'FIXED', 'CHOOSE_2024')`,
    ),
    check(
      "backgrounds_definition_types_check",
      sql`jsonb_typeof(${table.sections}) = 'array'
        and jsonb_typeof(${table.abilityRule}) = 'object'
        and jsonb_typeof(${table.proficiencyGrants}) = 'array'
        and jsonb_typeof(${table.featGrants}) = 'array'
        and jsonb_typeof(${table.featureGrants}) = 'array'
        and jsonb_typeof(${table.equipmentOptions}) = 'array'
        and jsonb_typeof(${table.promptTables}) = 'array'`,
    ),
  ],
);
