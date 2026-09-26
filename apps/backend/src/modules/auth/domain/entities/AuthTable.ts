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
import { users } from "../../../users/domain/entities/UsersTable.js";

export const oauthProviderEnum = pgEnum("oauth_provider", ["GOOGLE", "DISCORD"]);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    userAgent: varchar("user_agent", { length: 500 }),
    ipHash: text("ip_hash"),
  },
  (table) => [
    uniqueIndex("refresh_tokens_token_hash_unique_idx").on(table.tokenHash),
    index("refresh_tokens_user_id_idx").on(table.userId),
    index("refresh_tokens_family_id_idx").on(table.familyId),
    index("refresh_tokens_expires_at_idx").on(table.expiresAt),
    index("refresh_tokens_user_family_expiry_idx").on(
      table.userId,
      table.familyId,
      table.expiresAt,
    ),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique_idx").on(table.tokenHash),
    uniqueIndex("password_reset_tokens_user_active_unique_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} is null and ${table.consumedAt} is null`),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
  ],
);
