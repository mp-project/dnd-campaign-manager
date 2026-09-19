import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";

export const rulesetStatusEnum = pgEnum("ruleset_status", ["ACTIVE", "ARCHIVED"]);

export const assetRulesetCompatibilityEnum = pgEnum("asset_ruleset_compatibility", [
  "SUPPORTED",
  "NEUTRAL",
]);

export const rulesets = pgTable(
  "rulesets",
  {
    ...baseColumns(),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    status: rulesetStatusEnum("status").notNull().default("ACTIVE"),
    editionYear: integer("edition_year").notNull(),
    sourceReference: jsonb("source_reference").notNull().default(sql`'{}'::jsonb`),
    licenseCode: varchar("license_code", { length: 80 }).notNull(),
    attribution: text("attribution"),
  },
  (table) => [
    uniqueIndex("rulesets_code_active_unique_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.status} = 'ACTIVE'`),
    check("rulesets_edition_year_check", sql`${table.editionYear} between 1900 and 3000`),
  ],
);

export const rulesetLevelProgressions = pgTable(
  "ruleset_level_progressions",
  {
    ...baseColumns(),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => rulesets.id, { onDelete: "restrict" }),
    characterLevel: smallint("character_level").notNull(),
    proficiencyBonus: smallint("proficiency_bonus").notNull(),
    experienceThreshold: integer("experience_threshold"),
  },
  (table) => [
    uniqueActiveIndex(
      "ruleset_level_progressions_ruleset_level_active_unique_idx",
      [table.rulesetId, table.characterLevel],
      table.deletedAt,
    ),
    check(
      "ruleset_level_progressions_character_level_check",
      sql`${table.characterLevel} between 1 and 20`,
    ),
    check(
      "ruleset_level_progressions_proficiency_bonus_check",
      sql`${table.proficiencyBonus} >= 1`,
    ),
    check(
      "ruleset_level_progressions_experience_threshold_check",
      sql`${table.experienceThreshold} is null or ${table.experienceThreshold} >= 0`,
    ),
  ],
);

export const rulesetSpellSlotProgressions = pgTable(
  "ruleset_spell_slot_progressions",
  {
    ...baseColumns(),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => rulesets.id, { onDelete: "restrict" }),
    casterLevel: smallint("caster_level").notNull(),
    slotLevel: smallint("slot_level").notNull(),
    slotCount: smallint("slot_count").notNull(),
  },
  (table) => [
    uniqueActiveIndex(
      "ruleset_spell_slot_progressions_ruleset_caster_slot_active_unique_idx",
      [table.rulesetId, table.casterLevel, table.slotLevel],
      table.deletedAt,
    ),
    check(
      "ruleset_spell_slot_progressions_caster_level_check",
      sql`${table.casterLevel} between 1 and 20`,
    ),
    check(
      "ruleset_spell_slot_progressions_slot_level_check",
      sql`${table.slotLevel} between 1 and 9`,
    ),
    check(
      "ruleset_spell_slot_progressions_slot_count_check",
      sql`${table.slotCount} >= 0`,
    ),
  ],
);

export const assetRulesets = pgTable(
  "asset_rulesets",
  {
    ...baseColumns(),
    assetId: uuid("asset_id").notNull(),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => rulesets.id, { onDelete: "restrict" }),
    compatibility: assetRulesetCompatibilityEnum("compatibility")
      .notNull()
      .default("SUPPORTED"),
  },
  (table) => [
    uniqueActiveIndex(
      "asset_rulesets_asset_ruleset_active_unique_idx",
      [table.assetId, table.rulesetId],
      table.deletedAt,
    ),
  ],
);
