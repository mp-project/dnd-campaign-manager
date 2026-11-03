import { and, asc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import {
  emailVerificationRequests,
  users,
  userSettings,
} from "#src/modules/users/domain/entities/UsersTable";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import type { UpdateSettingsDto } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import type { UpdateUserDto } from "#src/modules/users/domain/dto/UpdateUserDto";
import type { RequestUsersDto } from "#src/modules/users/domain/dto/RequestUsersDto";
import { toAuditActorId } from "#core/db/auditActor";

export type UserRow = typeof users.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type EmailVerificationRequestRow = typeof emailVerificationRequests.$inferSelect;

export type UserAggregate = {
  user: UserRow;
  settings: UserSettingsRow;
};

export type UserListFilter = RequestUsersDto["listQuery"];
export type UpdateProfilePatch = UpdateMeDto;
export type UpdateSettingsPatch = UpdateSettingsDto;
export type UpdateUserPatch = Omit<UpdateUserDto, "expectedVersion">;

export class UsersRepository {
  async findById(db: AppDatabase, userId: string): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findByEmail(db: AppDatabase, email: string): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findByUserTag(db: AppDatabase, userTag: string): Promise<UserRow | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.userTag, userTag.toLowerCase()), isNull(users.deletedAt)))
      .limit(1);

    return user ?? null;
  }

  async listPublicSummaries(
    db: AppDatabase,
    userIds: string[],
  ): Promise<Array<{ id: string; userTag: string; displayName: string }>> {
    if (userIds.length === 0) {
      return [];
    }

    return db
      .select({ id: users.id, userTag: users.userTag, displayName: users.displayName })
      .from(users)
      .where(and(inArray(users.id, userIds), isNull(users.deletedAt)));
  }

  async isActiveEmailTaken(
    db: AppDatabase,
    email: string,
    excludedUserId?: string,
  ): Promise<boolean> {
    const where = [eq(users.email, email), isNull(users.deletedAt)];

    if (excludedUserId) {
      where.push(ne(users.id, excludedUserId));
    }

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...where))
      .limit(1);

    return rows.length > 0;
  }

  async list(
    db: AppDatabase,
    filter: UserListFilter,
  ): Promise<UserRow[]> {
    return db
      .select()
      .from(users)
      .where(and(...this.buildListWhere(filter)))
      .orderBy(asc(users.createdAt))
      .limit(filter.limit);
  }

  async count(db: AppDatabase, filter: UserListFilter): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...this.buildListWhere(filter)));

    return row?.total ?? 0;
  }

  async countActiveAdmins(db: AppDatabase): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(
        and(
          eq(users.systemRole, SYSTEM_ROLE.ADMIN),
          eq(users.status, "ACTIVE"),
          isNull(users.deletedAt),
        ),
      );

    return row?.total ?? 0;
  }

  async findSettingsByUserId(
    db: AppDatabase,
    userId: string,
  ): Promise<UserSettingsRow | null> {
    const rows = await db
      .select()
      .from(userSettings)
      .where(and(eq(userSettings.userId, userId), isNull(userSettings.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findOrCreateSettings(
    db: AppDatabase,
    userId: string,
    actorId: string,
  ): Promise<UserSettingsRow> {
    const existing = await this.findSettingsByUserId(db, userId);

    if (existing) {
      return existing;
    }

    const auditActorId = toAuditActorId(actorId);

    try {
      const [created] = await db
        .insert(userSettings)
        .values({
          userId,
          locale: "de",
          timezone: "UTC",
          theme: "SYSTEM",
          reducedMotion: false,
          uiPreferences: {},
          createdBy: auditActorId,
          updatedBy: auditActorId,
        })
        .returning();

      if (created) {
        return created;
      }
    } catch {
      // concurrent insert race: load row below
    }

    const rowAfterCreate = await this.findSettingsByUserId(db, userId);

    if (!rowAfterCreate) {
      throw new Error("Failed to create default user settings");
    }

    return rowAfterCreate;
  }

  async updateProfile(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      patch: UpdateProfilePatch;
    },
  ): Promise<UserRow | null> {
    const updateInput: Partial<typeof users.$inferInsert> = {};

    if (params.patch.displayName !== undefined) {
      updateInput.displayName = params.patch.displayName;
    }

    if (params.patch.email !== undefined) {
      updateInput.email = params.patch.email;
      updateInput.emailVerifiedAt = null;
    }

    const auditActorId = toAuditActorId(params.actorId);

    const [updated] = await db
      .update(users)
      .set({
        ...updateInput,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(users.id, params.userId), isNull(users.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async updateSettings(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      patch: UpdateSettingsPatch;
    },
  ): Promise<UserSettingsRow> {
    const existing = await this.findOrCreateSettings(db, params.userId, params.actorId);
    const auditActorId = toAuditActorId(params.actorId);

    const updateInput: Partial<typeof userSettings.$inferInsert> = {};

    if (params.patch.locale !== undefined) {
      updateInput.locale = params.patch.locale;
    }

    if (params.patch.timezone !== undefined) {
      updateInput.timezone = params.patch.timezone;
    }

    if (params.patch.theme !== undefined) {
      updateInput.theme = params.patch.theme;
    }

    if (params.patch.reducedMotion !== undefined) {
      updateInput.reducedMotion = params.patch.reducedMotion;
    }

    if (params.patch.uiPreferences !== undefined) {
      updateInput.uiPreferences = params.patch.uiPreferences;
    }

    const [updated] = await db
      .update(userSettings)
      .set({
        ...updateInput,
        version: sql`${userSettings.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(userSettings.id, existing.id),
          eq(userSettings.version, existing.version),
          isNull(userSettings.deletedAt),
        ),
      )
      .returning();

    if (updated) {
      return updated;
    }

    const fallback = await this.findSettingsByUserId(db, params.userId);

    if (!fallback) {
      throw new Error("Failed to update user settings");
    }

    return fallback;
  }

  async update(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      expectedVersion: number;
      patch: UpdateUserPatch;
    },
  ): Promise<UserRow | null> {
    const auditActorId = toAuditActorId(params.actorId);

    const updateInput: Partial<typeof users.$inferInsert> = {};

    if (params.patch.displayName !== undefined) {
      updateInput.displayName = params.patch.displayName;
    }

    if (params.patch.systemRole !== undefined) {
      updateInput.systemRole = params.patch.systemRole;
    }

    if (params.patch.status !== undefined) {
      updateInput.status = params.patch.status;
    }

    const [updated] = await db
      .update(users)
      .set({
        ...updateInput,
        version: params.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(users.id, params.userId),
          eq(users.version, params.expectedVersion),
          isNull(users.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  /**
   * Loads the user with their settings; missing settings are created with defaults.
   */
  async findAggregate(
    db: AppDatabase,
    userId: string,
    actorId: string,
  ): Promise<UserAggregate | null> {
    const user = await this.findById(db, userId);

    if (!user) {
      return null;
    }

    const settings = await this.findOrCreateSettings(db, userId, actorId);

    return { user, settings };
  }

  private buildListWhere(filter: UserListFilter) {
    const where = [isNull(users.deletedAt)];

    if (!filter.includeDisabled) {
      where.push(ne(users.status, "DISABLED"));
    }

    if (filter.status) {
      where.push(eq(users.status, filter.status));
    }

    if (filter.systemRole) {
      where.push(eq(users.systemRole, filter.systemRole));
    }

    if (filter.search) {
      const searchCondition = or(
        ilike(users.email, `%${filter.search}%`),
        ilike(users.displayName, `%${filter.search}%`),
      );

      if (searchCondition) {
        where.push(searchCondition);
      }
    }

    return where;
  }
}
