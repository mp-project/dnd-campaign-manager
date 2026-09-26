import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
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
export const emailVerificationStatusEnum = pgEnum("email_verification_status", [
  "PENDING",
  "VERIFIED",
  "EXPIRED",
  "SUPERSEDED",
]);

export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash"),
    googleSubject: varchar("google_subject", { length: 255 }),
    discordUserId: varchar("discord_user_id", { length: 32 }),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    systemRole: userSystemRoleEnum("system_role").notNull().default(SYSTEM_ROLE.USER),
    status: userStatusEnum("status").notNull().default("ACTIVE"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_email_active_unique_idx")
      .on(table.email)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex("users_single_system_user_active_unique_idx")
      .on(table.systemRole)
      .where(
        sql`${table.systemRole} = 'SYSTEM' and ${table.deletedAt} is null`,
      ),
    uniqueIndex("users_google_subject_active_unique_idx")
      .on(table.googleSubject)
      .where(
        sql`${table.googleSubject} is not null and ${table.deletedAt} is null`,
      ),
    uniqueIndex("users_discord_user_id_active_unique_idx")
      .on(table.discordUserId)
      .where(
        sql`${table.discordUserId} is not null and ${table.deletedAt} is null`,
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

export const emailVerificationRequests = pgTable(
  "email_verification_requests",
  {
    ...baseColumns(),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: text("code_hash").notNull(),
    status: emailVerificationStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    attemptCount: integer("attempt_count").notNull().default(0),
  },
  (table) => [
    index("email_verification_requests_email_idx").on(table.email),
    index("email_verification_requests_status_idx").on(table.status),
    uniqueIndex("email_verification_requests_pending_email_unique_idx")
      .on(table.email)
      .where(sql`${table.status} = 'PENDING' and ${table.deletedAt} is null`),
  ],
);
