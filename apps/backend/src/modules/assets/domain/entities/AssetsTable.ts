import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";
import { campaigns } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { rulesets } from "../../../ruleset/domain/entities/RulesetTable.js";

export const ASSET_TYPES = [
  "NOTE",
  "FEATURE",
  "CLASS",
  "SUBCLASS",
  "SPECIES",
  "SPECIES_VARIANT",
  "FEAT",
  "SPELL",
  "SPELL_LIST",
  "ITEM",
  "BACKGROUND",
  "MONSTER_DEFINITION",
  "PLAYER_CHARACTER",
  "NPC",
  "MONSTER",
  "LOCATION",
  "EVENT",
  "INTERACTION",
  "ENCOUNTER",
  "QUEST",
  "STORYLINE",
  "SESSION",
] as const;

export const ASSET_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export const ASSET_SCOPES = ["SYSTEM", "CAMPAIGN"] as const;
export const ASSET_ORIGINS = ["DEFAULT", "CUSTOM"] as const;
export const ASSET_RULESET_POLICIES = ["NEUTRAL", "RESTRICTED"] as const;

export const assetTypeEnum = pgEnum("asset_type", ASSET_TYPES);
export const assetStatusEnum = pgEnum("asset_status", ASSET_STATUSES);
export const assetScopeEnum = pgEnum("asset_scope", ASSET_SCOPES);
export const assetOriginEnum = pgEnum("asset_origin", ASSET_ORIGINS);
export const assetRulesetPolicyEnum = pgEnum("asset_ruleset_policy", ASSET_RULESET_POLICIES);

export const assetFamilies = pgTable(
  "asset_families",
  {
    ...baseColumns(),
    assetType: assetTypeEnum("asset_type").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
  },
  (table) => [
    uniqueActiveIndex(
      "asset_families_type_code_active_unique_idx",
      [table.assetType, table.code],
      table.deletedAt,
    ),
    unique("asset_families_id_type_unique").on(table.id, table.assetType),
  ],
);

export const assets = pgTable(
  "assets",
  {
    ...baseColumns(),
    assetType: assetTypeEnum("asset_type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 220 }).notNull(),
    summary: varchar("summary", { length: 500 }),
    status: assetStatusEnum("status").notNull().default("DRAFT"),
    scope: assetScopeEnum("scope").notNull(),
    origin: assetOriginEnum("origin").notNull(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetFamilyId: uuid("asset_family_id"),
    rulesetPolicy: assetRulesetPolicyEnum("ruleset_policy").notNull().default("NEUTRAL"),
    sourceReference: jsonb("source_reference"),
  },
  (table) => [
    foreignKey({
      name: "assets_family_type_fk",
      columns: [table.assetFamilyId, table.assetType],
      foreignColumns: [assetFamilies.id, assetFamilies.assetType],
    }).onDelete("restrict"),
    unique("assets_id_campaign_unique").on(table.id, table.campaignId),
    uniqueIndex("assets_campaign_type_slug_active_unique_idx")
      .on(table.campaignId, table.assetType, table.slug)
      .where(sql`${table.deletedAt} is null and ${table.scope} = 'CAMPAIGN'`),
    uniqueIndex("assets_system_type_slug_active_unique_idx")
      .on(table.assetType, table.slug)
      .where(sql`${table.deletedAt} is null and ${table.scope} = 'SYSTEM'`),
    index("assets_campaign_type_idx").on(table.campaignId, table.assetType),
    index("assets_scope_type_idx").on(table.scope, table.assetType),
    index("assets_family_idx").on(table.assetFamilyId),
    check(
      "assets_scope_origin_campaign_check",
      sql`(${table.scope} = 'SYSTEM' and ${table.origin} = 'DEFAULT' and ${table.campaignId} is null)
        or (${table.scope} = 'CAMPAIGN' and ${table.origin} = 'CUSTOM' and ${table.campaignId} is not null)`,
    ),
  ],
);

export const assetRulesets = pgTable(
  "asset_rulesets",
  {
    ...baseColumns(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => rulesets.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueActiveIndex(
      "asset_rulesets_asset_ruleset_active_unique_idx",
      [table.assetId, table.rulesetId],
      table.deletedAt,
    ),
    index("asset_rulesets_ruleset_id_idx").on(table.rulesetId),
  ],
);
