import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgEnum, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { CREATURE_TYPES } from "../../../species/domain/entities/SpeciesTable.js";

/**
 * What an actor is in the campaign. Only for sorting, filtering and assignment: every actor has the
 * same data, and the category can change (a monster becomes a companion, an NPC a player character).
 */
export const ACTOR_CATEGORIES = ["PLAYER_CHARACTER", "NPC", "MONSTER"] as const;
export const ACTOR_SIZES = ["TINY", "SMALL", "MEDIUM", "LARGE", "HUGE", "GARGANTUAN"] as const;
export const ALIGNMENTS = [
  "LAWFUL_GOOD",
  "NEUTRAL_GOOD",
  "CHAOTIC_GOOD",
  "LAWFUL_NEUTRAL",
  "NEUTRAL",
  "CHAOTIC_NEUTRAL",
  "LAWFUL_EVIL",
  "NEUTRAL_EVIL",
  "CHAOTIC_EVIL",
  "UNALIGNED",
  "ANY",
] as const;
export { CREATURE_TYPES };

/** Parts stored as one jsonb value each and checked by the DTOs (`ActorPartsDto`). */
export const ACTOR_PARTS = [
  "abilities",
  "skills",
  "proficiencies",
  "languages",
  "senses",
  "speeds",
  "defenses",
  "combat",
  "traits",
  "appearance",
  "personality",
  "wallet",
  "loot",
] as const;

/** Parts that are lists; the others are objects. */
export const ACTOR_LIST_PARTS = [
  "skills",
  "proficiencies",
  "languages",
  "senses",
  "speeds",
  "defenses",
  "traits",
  "loot",
] as const;

/** Upper bounds in characters; the DTOs use the same values. */
export const ACTOR_DISPLAY_NAME_MAX_LENGTH = 160;
export const ACTOR_SUBTYPE_MAX_LENGTH = 80;
export const ACTOR_DESCRIPTION_MAX_LENGTH = 50_000;
export const ACTOR_NOTES_MAX_LENGTH = 20_000;

export const actorCategoryEnum = pgEnum("actor_category", ACTOR_CATEGORIES);
export const actorSizeEnum = pgEnum("actor_size", ACTOR_SIZES);
export const actorCreatureTypeEnum = pgEnum("actor_creature_type", CREATURE_TYPES);
export const actorAlignmentEnum = pgEnum("actor_alignment", ALIGNMENTS);

const max = (value: number) => sql.raw(String(value));

/**
 * A character, NPC or monster of a campaign on an asset of type `ACTOR`. Name, summary, status and
 * tags belong to the asset, the portrait is its cover image (media). The row holds what every
 * actor has: the base values a stat block is computed from, never the computed values themselves.
 * The composite foreign key keeps actor and asset in one campaign; an actor is never global.
 */
export const actors = pgTable(
  "actors",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    category: actorCategoryEnum("category").notNull(),
    displayName: varchar("display_name", { length: ACTOR_DISPLAY_NAME_MAX_LENGTH }),
    size: actorSizeEnum("size").notNull().default("MEDIUM"),
    creatureType: actorCreatureTypeEnum("creature_type"),
    creatureSubtype: varchar("creature_subtype", { length: ACTOR_SUBTYPE_MAX_LENGTH }),
    alignment: actorAlignmentEnum("alignment"),
    /** Markdown, rendered on reading. */
    description: text("description"),
    /** For GMs and editors; later also for the player of an own character. */
    notes: text("notes"),
    /** Only for GMs and editors; never part of a player view. */
    gmNotes: text("gm_notes"),
    abilities: jsonb("abilities").$type<Record<string, unknown>>().notNull(),
    skills: jsonb("skills").$type<unknown[]>().notNull().default([]),
    proficiencies: jsonb("proficiencies").$type<unknown[]>().notNull().default([]),
    languages: jsonb("languages").$type<unknown[]>().notNull().default([]),
    senses: jsonb("senses").$type<unknown[]>().notNull().default([]),
    speeds: jsonb("speeds").$type<unknown[]>().notNull().default([]),
    defenses: jsonb("defenses").$type<unknown[]>().notNull().default([]),
    combat: jsonb("combat").$type<Record<string, unknown>>().notNull().default({}),
    traits: jsonb("traits").$type<unknown[]>().notNull().default([]),
    appearance: jsonb("appearance").$type<Record<string, unknown>>().notNull().default({}),
    personality: jsonb("personality").$type<Record<string, unknown>>().notNull().default({}),
    wallet: jsonb("wallet").$type<Record<string, unknown>>().notNull().default({}),
    loot: jsonb("loot").$type<unknown[]>().notNull().default([]),
  },
  (table) => [
    foreignKey({
      name: "actors_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("actors_asset_active_unique_idx", [table.assetId], table.deletedAt),
    index("actors_campaign_category_idx")
      .on(table.campaignId, table.category)
      .where(sql`${table.deletedAt} is null`),
    check(
      "actors_abilities_check",
      sql`jsonb_typeof(${table.abilities}) = 'object'
        and ${table.abilities} ?& array['str', 'dex', 'con', 'int', 'wis', 'cha']`,
    ),
    check(
      "actors_list_parts_check",
      sql.join(
        ACTOR_LIST_PARTS.map((part) => sql`jsonb_typeof(${table[part]}) = 'array'`),
        sql` and `,
      ),
    ),
    check(
      "actors_object_parts_check",
      sql`jsonb_typeof(${table.combat}) = 'object' and jsonb_typeof(${table.appearance}) = 'object'
        and jsonb_typeof(${table.personality}) = 'object' and jsonb_typeof(${table.wallet}) = 'object'`,
    ),
    check(
      "actors_display_name_check",
      sql`${table.displayName} is null or char_length(trim(${table.displayName})) > 0`,
    ),
    check(
      "actors_creature_subtype_check",
      sql`${table.creatureSubtype} is null or char_length(trim(${table.creatureSubtype})) > 0`,
    ),
    check(
      "actors_texts_check",
      sql`(${table.description} is null or char_length(${table.description}) between 1 and ${max(ACTOR_DESCRIPTION_MAX_LENGTH)})
        and (${table.notes} is null or char_length(${table.notes}) between 1 and ${max(ACTOR_NOTES_MAX_LENGTH)})
        and (${table.gmNotes} is null or char_length(${table.gmNotes}) between 1 and ${max(ACTOR_NOTES_MAX_LENGTH)})`,
    ),
  ],
);
