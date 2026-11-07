import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
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

export const FEATURE_TYPES = ["PASSIVE", "ACTIVE", "REACTION", "RESOURCE", "RULE"] as const;
export const FEATURE_STACKING_MODES = ["NONE", "STACK", "HIGHEST", "REPLACE"] as const;

/** Upper bound in characters; the DTOs use the same value. */
export const FEATURE_DESCRIPTION_MAX_LENGTH = 50_000;

export const featureTypeEnum = pgEnum("feature_type", FEATURE_TYPES);
export const featureStackingModeEnum = pgEnum("feature_stacking_mode", FEATURE_STACKING_MODES);

/** Parts of the definition graph; each is one jsonb array, validated by the DTOs. */
export const FEATURE_GRAPH_PARTS = [
  "parameters",
  "choices",
  "resources",
  "scalingTracks",
  "activations",
  "effects",
  "supersedes",
] as const;

const jsonArray = (name: string) => jsonb(name).notNull().default(sql`'[]'::jsonb`);

/**
 * Declarative definition of a class, species, feat, item or monster feature. Name, summary,
 * status, rulesets and family belong to the asset of type `FEATURE`. Global features have no
 * campaign; custom features belong to one, which the composite foreign key keeps in line with the
 * asset.
 */
export const features = pgTable(
  "features",
  {
    ...baseColumns(),
    campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "restrict" }),
    assetId: uuid("asset_id").notNull(),
    code: varchar("code", { length: 100 }).notNull(),
    featureType: featureTypeEnum("feature_type").notNull(),
    description: text("description"),
    stackingMode: featureStackingModeEnum("stacking_mode").notNull().default("NONE"),
    sections: jsonArray("sections"),
    parameters: jsonArray("parameters"),
    choices: jsonArray("choices"),
    resources: jsonArray("resources"),
    scalingTracks: jsonArray("scaling_tracks"),
    activations: jsonArray("activations"),
    effects: jsonArray("effects"),
    supersedes: jsonArray("supersedes"),
  },
  (table) => [
    foreignKey({
      name: "features_asset_fk",
      columns: [table.assetId],
      foreignColumns: [assets.id],
    }).onDelete("restrict"),
    // Without a campaign the composite key is not checked, so global features rely on the first one.
    foreignKey({
      name: "features_asset_campaign_fk",
      columns: [table.assetId, table.campaignId],
      foreignColumns: [assets.id, assets.campaignId],
    }).onDelete("restrict"),
    uniqueActiveIndex("features_asset_active_unique_idx", [table.assetId], table.deletedAt),
    uniqueIndex("features_campaign_code_active_unique_idx")
      .on(table.campaignId, table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is not null`),
    uniqueIndex("features_system_code_active_unique_idx")
      .on(table.code)
      .where(sql`${table.deletedAt} is null and ${table.campaignId} is null`),
    index("features_campaign_idx").on(table.campaignId),
    check("features_code_format_check", sql`${table.code} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(
      "features_description_length_check",
      sql`${table.description} is null or char_length(${table.description}) between 1 and ${sql.raw(
        String(FEATURE_DESCRIPTION_MAX_LENGTH),
      )}`,
    ),
    check(
      "features_graph_arrays_check",
      sql`jsonb_typeof(${table.sections}) = 'array'
        and jsonb_typeof(${table.parameters}) = 'array'
        and jsonb_typeof(${table.choices}) = 'array'
        and jsonb_typeof(${table.resources}) = 'array'
        and jsonb_typeof(${table.scalingTracks}) = 'array'
        and jsonb_typeof(${table.activations}) = 'array'
        and jsonb_typeof(${table.effects}) = 'array'
        and jsonb_typeof(${table.supersedes}) = 'array'`,
    ),
  ],
);
