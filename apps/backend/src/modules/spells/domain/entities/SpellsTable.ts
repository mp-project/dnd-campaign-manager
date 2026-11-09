import { sql } from "drizzle-orm";
import {
  boolean,
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

export const SPELL_SCHOOLS = [
  "ABJURATION",
  "CONJURATION",
  "DIVINATION",
  "ENCHANTMENT",
  "EVOCATION",
  "ILLUSION",
  "NECROMANCY",
  "TRANSMUTATION",
] as const;

export const CASTING_TIME_TYPES = ["ACTION", "BONUS_ACTION", "REACTION", "MINUTE", "HOUR"] as const;
export const RANGE_TYPES = ["SELF", "TOUCH", "DISTANCE", "SIGHT", "UNLIMITED"] as const;
export const RANGE_UNITS = ["FEET", "METERS", "MILES", "KILOMETERS"] as const;
export const DURATION_TYPES = ["INSTANTANEOUS", "TIMED", "UNTIL_DISPELLED", "SPECIAL"] as const;
export const DURATION_UNITS = ["ROUND", "MINUTE", "HOUR", "DAY"] as const;

/** Cantrips are level 0; the highest spell level is 9. */
export const SPELL_MAX_LEVEL = 9;

/** Upper bound in characters; the DTOs use the same value. */
export const SPELL_TEXT_MAX_LENGTH = 50_000;
export const SPELL_TRIGGER_MAX_LENGTH = 500;

/** Upper bound of entries in a spell list; the DTOs use the same value. */
export const SPELL_LIST_MAX_ENTRIES = 1_000;

export const spellSchoolEnum = pgEnum("spell_school", SPELL_SCHOOLS);
export const spellCastingTimeTypeEnum = pgEnum("spell_casting_time_type", CASTING_TIME_TYPES);
export const spellRangeTypeEnum = pgEnum("spell_range_type", RANGE_TYPES);
export const spellRangeUnitEnum = pgEnum("spell_range_unit", RANGE_UNITS);
export const spellDurationTypeEnum = pgEnum("spell_duration_type", DURATION_TYPES);
export const spellDurationUnitEnum = pgEnum("spell_duration_unit", DURATION_UNITS);

/**
 * Parts of the definition, each stored as one jsonb value and validated by the DTOs. They refer to
 * each other by key (effects to targets, effects to each other, expressions to scaling tracks), so
 * history treats them as one unit.
 */
export const SPELL_DEFINITION_PARTS = [
  "sections",
  "materials",
  "requirements",
  "targets",
  "choices",
  "scalingTracks",
  "effects",
] as const;

/**
 * Definition of a spell. Name, summary, status, rulesets and source belong to the asset of type
 * `SPELL`. Global spells have no campaign and are changed by administrators only; custom spells
 * belong to one campaign, which the composite foreign key keeps in line with the asset. Slots, their
 * use, consumed materials and concentration are state of an actor, never of the spell; which actor
 * knows or prepared a spell is stored by the actor modules.
 */
export const spells = pgTable(
  "spells",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    level: integer("level").notNull(),
    school: spellSchoolEnum("school").notNull(),
    description: text("description"),
    higherLevelDescription: text("higher_level_description"),
    isRitual: boolean("is_ritual").notNull().default(false),
    castingTimeType: spellCastingTimeTypeEnum("casting_time_type").notNull(),
    castingTimeAmount: integer("casting_time_amount").notNull().default(1),
    /** What a reaction answers to; only for `REACTION`. */
    castingTrigger: text("casting_trigger"),
    rangeType: spellRangeTypeEnum("range_type").notNull(),
    rangeDistance: integer("range_distance"),
    rangeUnit: spellRangeUnitEnum("range_unit"),
    durationType: spellDurationTypeEnum("duration_type").notNull(),
    durationAmount: integer("duration_amount"),
    durationUnit: spellDurationUnitEnum("duration_unit"),
    requiresConcentration: boolean("requires_concentration").notNull().default(false),
    componentVerbal: boolean("component_verbal").notNull().default(false),
    componentSomatic: boolean("component_somatic").notNull().default(false),
    /** The material components themselves are in `materials`; one entry at least while set. */
    componentMaterial: boolean("component_material").notNull().default(false),
    sections: jsonb("sections").notNull().default(sql`'[]'::jsonb`),
    materials: jsonb("materials").notNull().default(sql`'[]'::jsonb`),
    requirements: jsonb("requirements").notNull().default(sql`'[]'::jsonb`),
    targets: jsonb("targets").notNull().default(sql`'[]'::jsonb`),
    choices: jsonb("choices").notNull().default(sql`'[]'::jsonb`),
    scalingTracks: jsonb("scaling_tracks").notNull().default(sql`'[]'::jsonb`),
    effects: jsonb("effects").notNull().default(sql`'[]'::jsonb`),
    /**
     * Spell lists the spell names itself (asset ids). A list contains its own entries plus the
     * spells that name it, so a custom spell can join a global list for its campaign only.
     */
    spellListIds: jsonb("spell_list_ids").notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    foreignKey({
      name: "spells_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global spells rely on the first one.
    foreignKey({
      name: "spells_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("spells_asset_active_unique_idx", [table.assetId], table.deletedAt),
    // Global spells share codes across rulesets (2014 and 2024 Fireball); the service keeps codes
    // unique per ruleset there.
    uniqueIndex("spells_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("spells_campaign_idx").on(table.campaignId),
    index("spells_level_idx").on(table.level),
    // Membership filters ask `spell_list_ids @> [list]`.
    index("spells_spell_list_ids_idx").using("gin", table.spellListIds),
    index("spells_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("spells_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "spells_level_check",
      sql`${table.level} between 0 and ${sql.raw(String(SPELL_MAX_LEVEL))}`,
    ),
    check(
      "spells_text_length_check",
      sql`(${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(SPELL_TEXT_MAX_LENGTH),
      )})
        and (${table.higherLevelDescription} is null or char_length(${table.higherLevelDescription}) between 1 and ${sql.raw(
          String(SPELL_TEXT_MAX_LENGTH),
        )})`,
    ),
    check("spells_ritual_check", sql`not ${table.isRitual} or ${table.level} > 0`),
    check(
      "spells_casting_time_check",
      sql`${table.castingTimeAmount} between 1 and 1000
        and (${table.castingTrigger} is not null) = (${table.castingTimeType} = 'REACTION')
        and (${table.castingTimeType} in ('MINUTE', 'HOUR') or ${table.castingTimeAmount} = 1)`,
    ),
    check(
      "spells_range_check",
      sql`(${table.rangeType} = 'DISTANCE') = (${table.rangeDistance} is not null)
        and (${table.rangeDistance} is null) = (${table.rangeUnit} is null)
        and (${table.rangeDistance} is null or ${table.rangeDistance} between 1 and 1000000)`,
    ),
    check(
      "spells_duration_check",
      sql`(${table.durationType} = 'TIMED') = (${table.durationAmount} is not null)
        and (${table.durationAmount} is null) = (${table.durationUnit} is null)
        and (${table.durationAmount} is null or ${table.durationAmount} between 1 and 1000)
        and not (${table.requiresConcentration} and ${table.durationType} = 'INSTANTANEOUS')`,
    ),
    check(
      "spells_material_check",
      sql`${table.componentMaterial} = (case when jsonb_typeof(${table.materials}) = 'array' then jsonb_array_length(${table.materials}) > 0 else false end)`,
    ),
    check(
      "spells_definition_types_check",
      sql`jsonb_typeof(${table.sections}) = 'array'
        and jsonb_typeof(${table.materials}) = 'array'
        and jsonb_typeof(${table.requirements}) = 'array'
        and jsonb_typeof(${table.targets}) = 'array'
        and jsonb_typeof(${table.choices}) = 'array'
        and jsonb_typeof(${table.scalingTracks}) = 'array'
        and jsonb_typeof(${table.effects}) = 'array'
        and jsonb_typeof(${table.spellListIds}) = 'array'`,
    ),
  ],
);

/**
 * A spell list (class list, domain list, custom list) on an asset of type `SPELL_LIST`. Its own
 * entries are the asset ids in `spellIds`; in a campaign the spells that name the list
 * (`spells.spell_list_ids`) belong to it as well. Classes refer to their list by its asset.
 */
export const spellLists = pgTable(
  "spell_lists",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    description: text("description"),
    spellIds: jsonb("spell_ids").notNull().default(sql`'[]'::jsonb`),
  },
  (table) => [
    foreignKey({
      name: "spell_lists_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "spell_lists_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("spell_lists_asset_active_unique_idx", [table.assetId], table.deletedAt),
    uniqueIndex("spell_lists_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    index("spell_lists_campaign_idx").on(table.campaignId),
    // The lists of a spell ask `spell_ids @> [spell]`.
    index("spell_lists_spell_ids_idx").using("gin", table.spellIds),
    index("spell_lists_system_code_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    check("spell_lists_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "spell_lists_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(SPELL_TEXT_MAX_LENGTH),
      )}`,
    ),
    check(
      "spell_lists_spell_ids_check",
      sql`case when jsonb_typeof(${table.spellIds}) = 'array' then jsonb_array_length(${table.spellIds}) <= ${sql.raw(
        String(SPELL_LIST_MAX_ENTRIES),
      )} else false end`,
    ),
  ],
);
