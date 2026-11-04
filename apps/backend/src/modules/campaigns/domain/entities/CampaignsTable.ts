import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns } from "../../../../core/db/schemaHelpers.js";
import { rulesets } from "../../../ruleset/domain/entities/RulesetTable.js";
import { users } from "../../../users/domain/entities/UsersTable.js";

const campaignMemberRoles = ["EDITOR", "PLAYER"] as const;

export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

export const campaignMemberRoleEnum = pgEnum("campaign_member_role", campaignMemberRoles);
export const campaignMembershipStatusEnum = pgEnum("campaign_membership_status", [
  "PENDING",
  "ACTIVE",
  "REVOKED",
]);

export const campaigns = pgTable(
  "campaigns",
  {
    ...baseColumns(),
    createdBy: uuid("created_by").notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    rulesetId: uuid("ruleset_id")
      .notNull()
      .references(() => rulesets.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    description: text("description"),
    status: campaignStatusEnum("status").notNull().default("DRAFT"),
    currentGameDay: integer("current_game_day").notNull().default(0),
    longRestCount: integer("long_rest_count").notNull().default(0),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("campaigns_owner_slug_active_unique_idx")
      .on(table.ownerUserId, table.slug)
      .where(sql`${table.deletedAt} is null and ${table.status} <> 'ARCHIVED'`),
    index("campaigns_owner_user_id_idx").on(table.ownerUserId),
    index("campaigns_ruleset_id_idx").on(table.rulesetId),
    check("campaigns_current_game_day_check", sql`${table.currentGameDay} >= 0`),
    check("campaigns_long_rest_count_check", sql`${table.longRestCount} >= 0`),
  ],
);

export const campaignMemberships = pgTable(
  "campaign_memberships",
  {
    ...baseColumns(),
    createdBy: uuid("created_by").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: campaignMemberRoleEnum("role").notNull(),
    status: campaignMembershipStatusEnum("status").notNull().default("ACTIVE"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("campaign_memberships_campaign_user_active_unique_idx")
      .on(table.campaignId, table.userId)
      .where(
        sql`${table.deletedAt} is null and ${table.status} in ('PENDING', 'ACTIVE')`,
      ),
    index("campaign_memberships_campaign_id_idx").on(table.campaignId),
    index("campaign_memberships_user_id_idx").on(table.userId),
    check(
      "campaign_memberships_status_timestamps_check",
      sql`(${table.status} = 'PENDING' and ${table.joinedAt} is null and ${table.revokedAt} is null and ${table.revokedBy} is null)
        or (${table.status} = 'ACTIVE' and ${table.joinedAt} is not null and ${table.revokedAt} is null and ${table.revokedBy} is null)
        or (${table.status} = 'REVOKED' and ${table.revokedAt} is not null and ${table.revokedBy} is not null)`,
    ),
  ],
);
