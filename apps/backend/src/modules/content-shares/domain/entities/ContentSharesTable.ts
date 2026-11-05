import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { assets } from "../../../assets/domain/entities/AssetsTable.js";
import {
  campaignMemberships,
  campaigns,
} from "../../../campaigns/domain/entities/CampaignsTable.js";

export const CONTENT_SHARE_AUDIENCES = ["ALL_PLAYERS", "SELECTED_PLAYERS"] as const;

export const contentShareAudienceEnum = pgEnum("content_share_audience", CONTENT_SHARE_AUDIENCES);

/**
 * A reveal of content to players. It changes no content, so it has no history and no soft delete:
 * revoking deletes the row, an expired share is invisible at once and deleted at the next chance.
 * Global assets can be shared too, to draw attention to them, so the asset is only checked against
 * the campaign in the service and each campaign has its own share of a global asset.
 */
export const contentShares = pgTable(
  "content_shares",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull(),
    updatedBy: uuid("updated_by"),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    audience: contentShareAudienceEnum("audience").notNull(),
    /**
     * When all players got to see it; set again when the audience becomes all players. Stored in
     * milliseconds, like the cursors and the `since` of the clients, so comparisons match.
     */
    sharedAt: timestamp("shared_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    unique("content_shares_asset_campaign_unique").on(table.assetId, table.campaignId),
    index("content_shares_campaign_shared_idx").on(table.campaignId, table.sharedAt, table.id),
    index("content_shares_expires_idx").on(table.expiresAt),
    check(
      "content_shares_expires_check",
      sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

/** Players of a share with the audience `SELECTED_PLAYERS`; removed together with the share. */
export const contentShareRecipients = pgTable(
  "content_share_recipients",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    /** When this player got to see it; in milliseconds like `shared_at`. */
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    createdBy: uuid("created_by").notNull(),
    contentShareId: uuid("content_share_id")
      .notNull()
      .references(() => contentShares.id, { onDelete: "cascade" }),
    campaignMembershipId: uuid("campaign_membership_id")
      .notNull()
      .references(() => campaignMemberships.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("content_share_recipients_share_member_unique").on(
      table.contentShareId,
      table.campaignMembershipId,
    ),
    index("content_share_recipients_member_idx").on(table.campaignMembershipId),
  ],
);
