import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { SYSTEM_ROLE, SYSTEM_ROLES } from "../../../../core/permissions/roles.js";

import { baseColumns, uniqueActiveIndex } from "../../../../core/db/schemaHelpers.js";

export const userSystemRoleEnum = pgEnum("user_system_role", SYSTEM_ROLES);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "LOCKED", "DISABLED"]);
export const userThemeEnum = pgEnum("user_theme", ["SYSTEM", "LIGHT", "DARK"]);

export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    email: varchar("email", { length: 320 }).notNull(),
    // The account at the identity provider (Clerk `user_…`); null only for the system user.
    clerkUserId: varchar("clerk_user_id", { length: 64 }),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    username: varchar("username", { length: 24 }).notNull().default("player"),
    userTag: varchar("user_tag", { length: 32 })
      .notNull()
      .default(sql`('player#' || lpad(floor(random() * 1000000)::int::text, 6, '0'))`),
    systemRole: userSystemRoleEnum("system_role").notNull().default(SYSTEM_ROLE.USER),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_active_unique_idx")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("users_user_tag_unique_idx").on(table.userTag),
    uniqueIndex("users_single_system_user_active_unique_idx")
      .on(table.systemRole)
      .where(
        sql`${table.systemRole} = 'SYSTEM' and ${table.deletedAt} is null`,
      ),
    uniqueIndex("users_clerk_user_id_active_unique_idx")
      .on(table.clerkUserId)
      .where(
        sql`${table.clerkUserId} is not null and ${table.deletedAt} is null`,
      ),
  ],
);

export const userSettings = pgTable(
  "user_settings",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    locale: varchar("locale", { length: 12 }).notNull().default("de"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    theme: userThemeEnum("theme").notNull().default("SYSTEM"),
    reducedMotion: boolean("reduced_motion").notNull().default(false),
    uiPreferences: jsonb("ui_preferences").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueActiveIndex(
      "user_settings_user_id_active_unique_idx",
      [table.userId],
      table.deletedAt,
    ),
  ],
);
