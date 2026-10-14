import { sql } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { baseColumns } from "../../../../core/db/schemaHelpers.js";
import { campaigns, campaignMemberRoleEnum } from "../../../campaigns/domain/entities/CampaignsTable.js";
import { users } from "../../../users/domain/entities/UsersTable.js";

export const campaignInvitationStatusEnum = pgEnum("campaign_invitation_status", [
  "PENDING",
  "ACCEPTED",
  "REVOKED",
  "EXPIRED",
]);

export const campaignInvitations = pgTable(
  "campaign_invitations",
  {
    ...baseColumns(),
    createdBy: uuid("created_by").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 320 }).notNull(),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "restrict" }),
    role: campaignMemberRoleEnum("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: campaignInvitationStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    acceptedBy: uuid("accepted_by").references(() => users.id, { onDelete: "restrict" }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("campaign_invitations_token_hash_unique_idx").on(table.tokenHash),
    uniqueIndex("campaign_invitations_campaign_email_pending_unique_idx")
      .on(table.campaignId, table.email)
      .where(
        sql`${table.deletedAt} is null and ${table.status} = 'PENDING'`,
      ),
    index("campaign_invitations_target_status_idx").on(table.targetUserId, table.status),
    index("campaign_invitations_campaign_status_idx").on(table.campaignId, table.status),
  ],
);