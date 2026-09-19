import { and, asc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import {
  emailVerificationRequests,
  users,
  userSettings,
} from "#src/modules/users/domain/entities/UsersTable";
import type { UpdateMeDto } from "#src/modules/users/domain/dto/UpdateMeDto";
import type { UpdateSettingsDto } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import type { AdminUpdateUserDto } from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import type { RequestUsersDto } from "#src/modules/users/domain/dto/RequestUsersDto";
import { toAuditActorId } from "#src/modules/users/helpers/Audit";

export type UserRow = typeof users.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type EmailVerificationRequestRow = typeof emailVerificationRequests.$inferSelect;

export type UserAggregate = {
  user: UserRow;
  settings: UserSettingsRow;
};

export type AdminUserListFilter = RequestUsersDto["adminListQuery"];
export type UpdateMePatch = UpdateMeDto;
export type UpdateSettingsPatch = UpdateSettingsDto;
export type AdminUserPatch = Omit<AdminUpdateUserDto, "expectedVersion">;

export type CreateUserInput = {
  email: string;
  passwordHash: string;
  displayName: string;
  systemRole: UserRow["systemRole"];
  status: UserRow["status"];
  emailVerifiedAt: Date | null;
  actorId?: string;
};

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

  async createUser(db: AppDatabase, input: CreateUserInput): Promise<UserRow> {
    const auditActorId = toAuditActorId(input.actorId);

    const [created] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: input.passwordHash,
        displayName: input.displayName,
        systemRole: input.systemRole,
        status: input.status,
        emailVerifiedAt: input.emailVerifiedAt,
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create user");
    }

    return created;
  }

  async createEmailVerificationRequest(
    db: AppDatabase,
    params: {
      email: string;
      codeHash: string;
      expiresAt: Date;
      actorId?: string;
    },
  ): Promise<EmailVerificationRequestRow> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(emailVerificationRequests)
      .set({
        status: "SUPERSEDED",
        version: sql`${emailVerificationRequests.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(emailVerificationRequests.email, params.email),
          eq(emailVerificationRequests.status, "PENDING"),
          isNull(emailVerificationRequests.deletedAt),
        ),
      );

    const [created] = await db
      .insert(emailVerificationRequests)
      .values({
        email: params.email,
        codeHash: params.codeHash,
        status: "PENDING",
        expiresAt: params.expiresAt,
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create email verification request");
    }

    return created;
  }

  async markEmailVerified(
    db: AppDatabase,
    params: {
      userId: string;
      verifiedAt: Date;
      actorId?: string;
    },
  ): Promise<UserRow | null> {
    const auditActorId = toAuditActorId(params.actorId);

    const [updated] = await db
      .update(users)
      .set({
        emailVerifiedAt: params.verifiedAt,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(users.id, params.userId), isNull(users.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async findEmailVerificationRequestById(
    db: AppDatabase,
    verificationId: string,
  ): Promise<EmailVerificationRequestRow | null> {
    const rows = await db
      .select()
      .from(emailVerificationRequests)
      .where(
        and(
          eq(emailVerificationRequests.id, verificationId),
          isNull(emailVerificationRequests.deletedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async incrementEmailVerificationAttemptCount(
    db: AppDatabase,
    verificationId: string,
    actorId?: string,
  ): Promise<void> {
    const auditActorId = toAuditActorId(actorId);

    await db
      .update(emailVerificationRequests)
      .set({
        attemptCount: sql`${emailVerificationRequests.attemptCount} + 1`,
        version: sql`${emailVerificationRequests.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(emailVerificationRequests.id, verificationId),
          isNull(emailVerificationRequests.deletedAt),
        ),
      );
  }

  async updateEmailVerificationRequestStatus(
    db: AppDatabase,
    params: {
      verificationId: string;
      status: EmailVerificationRequestRow["status"];
      verifiedAt?: Date | null;
      actorId?: string;
    },
  ): Promise<EmailVerificationRequestRow | null> {
    const auditActorId = toAuditActorId(params.actorId);
    const updateInput: Partial<typeof emailVerificationRequests.$inferInsert> = {
      status: params.status,
    };

    if (params.verifiedAt !== undefined) {
      updateInput.verifiedAt = params.verifiedAt;
    }

    const [updated] = await db
      .update(emailVerificationRequests)
      .set({
        ...updateInput,
        version: sql`${emailVerificationRequests.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(emailVerificationRequests.id, params.verificationId),
          isNull(emailVerificationRequests.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
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

  async listAdminUsers(
    db: AppDatabase,
    filter: AdminUserListFilter,
  ): Promise<UserRow[]> {
    return db
      .select()
      .from(users)
      .where(and(...this.buildAdminListWhere(filter)))
      .orderBy(asc(users.createdAt))
      .limit(filter.limit);
  }

  async countAdminUsers(db: AppDatabase, filter: AdminUserListFilter): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(and(...this.buildAdminListWhere(filter)));

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

  async ensureSettings(
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

  async updateMe(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      patch: UpdateMePatch;
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
    const existing = await this.ensureSettings(db, params.userId, params.actorId);
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

  async updateAdminWithVersion(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      expectedVersion: number;
      patch: AdminUserPatch;
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

  async softDisableWithVersion(
    db: AppDatabase,
    params: {
      userId: string;
      actorId: string;
      expectedVersion: number;
    },
  ): Promise<boolean> {
    const auditActorId = toAuditActorId(params.actorId);

    const [updated] = await db
      .update(users)
      .set({
        status: "DISABLED",
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
      .returning({ id: users.id });

    return Boolean(updated);
  }

  async loadUserAggregate(
    db: AppDatabase,
    userId: string,
    actorId: string,
  ): Promise<UserAggregate | null> {
    const user = await this.findById(db, userId);

    if (!user) {
      return null;
    }

    const settings = await this.ensureSettings(db, userId, actorId);

    return { user, settings };
  }

  private buildAdminListWhere(filter: AdminUserListFilter) {
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
