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

export const CREATURE_TYPES = [
  "ABERRATION",
  "BEAST",
  "CELESTIAL",
  "CONSTRUCT",
  "DRAGON",
  "ELEMENTAL",
  "FEY",
  "FIEND",
  "GIANT",
  "HUMANOID",
  "MONSTROSITY",
  "OOZE",
  "PLANT",
  "UNDEAD",
] as const;

/**
 * Where the lifespan of a species comes from: the general rules of the ruleset, its own age
 * profile, or nowhere.
 */
export const LIFESPAN_MODES = ["RULESET_DEFAULT", "SPECIES_SPECIFIC", "UNSPECIFIED"] as const;

/** Upper bound in characters; the DTOs use the same value. */
export const SPECIES_DESCRIPTION_MAX_LENGTH = 50_000;

export const speciesCreatureTypeEnum = pgEnum("species_creature_type", CREATURE_TYPES);
export const speciesLifespanModeEnum = pgEnum("species_lifespan_mode", LIFESPAN_MODES);

/**
 * Parts of a species definition, each stored as one jsonb value and validated by the DTOs. They
 * don't refer to each other, apart from upgrades and replacements among the feature grants, which
 * are one part.
 */
export const SPECIES_DEFINITION_PARTS = [
  "sizeOptions",
  "movementModes",
  "ageProfile",
  "physicalProfile",
  "textSections",
  "variantGroups",
  "featureGrants",
] as const;

const jsonArray = (name: string) => jsonb(name).notNull().default(sql`'[]'::jsonb`);
const codeFormat = (column: unknown) => sql`${column} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`;
const descriptionLength = (column: unknown) =>
  sql`${column} is null or char_length(${column}) between 1 and ${sql.raw(
    String(SPECIES_DESCRIPTION_MAX_LENGTH),
  )}`;

/**
 * Definition of a species (2024) or race (2014). Name, summary, status, rulesets and family belong
 * to the asset of type `SPECIES`. Global species have no campaign and are changed by administrators
 * only; custom species belong to one campaign, which the composite foreign key keeps in line with
 * the asset. What a character chose is stored by the character modules, not here.
 */
export const species = pgTable(
  "species",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    creatureType: speciesCreatureTypeEnum("creature_type").notNull(),
    lifespanMode: speciesLifespanModeEnum("lifespan_mode").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    sizeOptions: jsonb("size_options").notNull(),
    movementModes: jsonb("movement_modes").notNull(),
    ageProfile: jsonb("age_profile"),
    physicalProfile: jsonb("physical_profile"),
    textSections: jsonArray("text_sections"),
    variantGroups: jsonArray("variant_groups"),
    featureGrants: jsonArray("feature_grants"),
  },
  (table) => [
    foreignKey({
      name: "species_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global species rely on the first one.
    foreignKey({
      name: "species_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("species_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Target of the composite key of variants, which keeps them in the campaign of their species.
    uniqueIndex("species_id_campaign_unique_idx").on(table.id, table.campaignId),
    // Global species share codes across rulesets (2014 and 2024 elf); the service keeps codes
    // unique per ruleset there.
    uniqueIndex("species_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("species_campaign_idx").on(table.campaignId),
    index("species_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("species_code_format_check", codeFormat(table.code)),
    check("species_description_length_check", descriptionLength(table.description)),
    check("species_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "species_definition_types_check",
      sql`jsonb_typeof(${table.sizeOptions}) = 'array'
        and jsonb_typeof(${table.movementModes}) = 'array'
        and (${table.ageProfile} is null or jsonb_typeof(${table.ageProfile}) = 'object')
        and (${table.physicalProfile} is null or jsonb_typeof(${table.physicalProfile}) = 'object')
        and jsonb_typeof(${table.textSections}) = 'array'
        and jsonb_typeof(${table.variantGroups}) = 'array'
        and jsonb_typeof(${table.featureGrants}) = 'array'`,
    ),
    // At least one size and the base walking speed; the DTOs check the rest.
    check(
      "species_size_movement_count_check",
      sql`jsonb_array_length(${table.sizeOptions}) >= 1
        and jsonb_array_length(${table.movementModes}) >= 1`,
    ),
  ],
);

/**
 * A variant of a species: subrace (2014) or lineage, legacy or ancestry (2024). Each variant is an
 * asset of type `SPECIES_VARIANT` with its own name, status, release and history, belongs to one
 * variant group of its species and adds its own feature grants. Variants live in the scope of their
 * species: global ones for global species, custom ones in the campaign of a custom species.
 */
export const speciesVariants = pgTable(
  "species_variants",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    speciesId: uuid("species_id").notNull(),
    variantGroupCode: varchar("variant_group_code", { length: 64 }).notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    displayOrder: integer("display_order").notNull().default(0),
    featureGrants: jsonArray("feature_grants"),
  },
  (table) => [
    foreignKey({
      name: "species_variants_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "species_variants_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    foreignKey({
      name: "species_variants_species_fk",
      columns: [table.speciesId],
      foreignColumns: [species.id],
    }).onDelete("restrict"),
    // A custom variant stays in the campaign of its species.
    foreignKey({
      name: "species_variants_species_campaign_fk",
      columns: [table.speciesId, table.campaignId],
      foreignColumns: [species.id, species.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("species_variants_asset_active_unique_idx", [table.assetId], table.deletedAt),
    uniqueActiveIndex(
      "species_variants_species_code_active_unique_idx",
      [table.speciesId, table.code],
      table.deletedAt,
    ),
    index("species_variants_species_idx").on(table.speciesId),
    index("species_variants_campaign_idx").on(table.campaignId),
    check("species_variants_code_format_check", codeFormat(table.code)),
    // Group codes are keys inside the species definition.
    check(
      "species_variants_group_code_format_check",
      sql`${table.variantGroupCode} ~ '^[a-z][a-z0-9_]{0,63}$'`,
    ),
    check("species_variants_description_length_check", descriptionLength(table.description)),
    check("species_variants_display_order_check", sql`${table.displayOrder} between 0 and 1000`),
    check(
      "species_variants_definition_types_check",
      sql`jsonb_typeof(${table.featureGrants}) = 'array'`,
    ),
  ],
);
