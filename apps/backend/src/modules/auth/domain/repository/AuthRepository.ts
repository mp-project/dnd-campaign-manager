import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  emailVerificationRequests,
  users,
} from "#src/modules/users/domain/entities/UsersTable";
import type { OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  authAttempts,
  passwordResetTokens,
  refreshTokens,
  trustedDevices,
} from "#src/modules/auth/domain/entities/AuthTable";
import { toAuditActorId } from "#core/db/auditActor";

export type UserRow = typeof users.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationRequestRow = typeof emailVerificationRequests.$inferSelect;

export type TrustedDeviceRow = typeof trustedDevices.$inferSelect;
export type AuthAttemptRow = typeof authAttempts.$inferSelect;

export type UpdateAuthAttemptInput = {
  keyHash: string;
  action: AuthAttemptRow["action"];
  max: number;
  now: Date;
  windowExpiresAt: Date;
  blockedUntil: Date;
};

export type CreateUserInput = {
  email: string;
  displayName: string;
  username: string;
  userTag: string;
  passwordHash: string | null;
  systemRole: UserRow["systemRole"];
  status: UserRow["status"];
  emailVerifiedAt: Date | null;
  googleSubject?: string;
  discordUserId?: string;
  actorId?: string;
};

export type CreateRefreshTokenInput = {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipHash?: string;
  actorId?: string;
};

export class AuthRepository {
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

  async findByGoogleSubject(
    db: AppDatabase,
    googleSubject: string,
  ): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.googleSubject, googleSubject), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findByDiscordUserId(
    db: AppDatabase,
    discordUserId: string,
  ): Promise<UserRow | null> {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.discordUserId, discordUserId), isNull(users.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async create(db: AppDatabase, input: CreateUserInput): Promise<UserRow> {
    const auditActorId = toAuditActorId(input.actorId);
    const values: typeof users.$inferInsert = {
      email: input.email,
      displayName: input.displayName,
      username: input.username,
      userTag: input.userTag,
      passwordHash: input.passwordHash,
      systemRole: input.systemRole,
      status: input.status,
      emailVerifiedAt: input.emailVerifiedAt,
      createdBy: auditActorId,
      updatedBy: auditActorId,
    };

    if (input.googleSubject !== undefined) {
      values.googleSubject = input.googleSubject;
    }

    if (input.discordUserId !== undefined) {
      values.discordUserId = input.discordUserId;
    }

    const [created] = await db.insert(users).values(values).returning();

    if (!created) {
      throw new Error("Failed to create user");
    }

    return created;
  }

  async updatePasswordHash(
    db: AppDatabase,
    params: {
      userId: string;
      passwordHash: string;
      actorId?: string;
    },
  ): Promise<UserRow | null> {
    const auditActorId = toAuditActorId(params.actorId);
    const [updated] = await db
      .update(users)
      .set({
        passwordHash: params.passwordHash,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(users.id, params.userId), isNull(users.deletedAt)))
      .returning();

    return updated ?? null;
  }

  async updateLastLogin(
    db: AppDatabase,
    params: {
      userId: string;
      at: Date;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(users)
      .set({
        lastLoginAt: params.at,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(users.id, params.userId), isNull(users.deletedAt)));
  }

  async updateOAuthIdentity(
    db: AppDatabase,
    params: {
      userId: string;
      provider: OAuthProvider;
      subject: string;
      markEmailVerifiedAt?: Date;
      actorId?: string;
    },
  ): Promise<UserRow | null> {
    const auditActorId = toAuditActorId(params.actorId);
    const updateInput: Partial<typeof users.$inferInsert> = {};

    if (params.provider === "GOOGLE") {
      updateInput.googleSubject = params.subject;
    } else {
      updateInput.discordUserId = params.subject;
    }

    if (params.markEmailVerifiedAt) {
      updateInput.emailVerifiedAt = params.markEmailVerifiedAt;
    }

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

  async updateEmailVerified(
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

  async updateEmailVerificationAttemptCount(
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

  async createRefreshToken(
    db: AppDatabase,
    input: CreateRefreshTokenInput,
  ): Promise<RefreshTokenRow> {
    const auditActorId = toAuditActorId(input.actorId);
    const values: typeof refreshTokens.$inferInsert = {
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdBy: auditActorId,
      updatedBy: auditActorId,
    };

    if (input.userAgent !== undefined) {
      values.userAgent = input.userAgent;
    }

    if (input.ipHash !== undefined) {
      values.ipHash = input.ipHash;
    }

    const [created] = await db.insert(refreshTokens).values(values).returning();

    if (!created) {
      throw new Error("Failed to create refresh token");
    }

    return created;
  }

  async findRefreshTokenByHash(
    db: AppDatabase,
    tokenHash: string,
  ): Promise<RefreshTokenRow | null> {
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findRefreshTokenByHashForUpdate(
    db: AppDatabase,
    tokenHash: string,
  ): Promise<RefreshTokenRow | null> {
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.deletedAt)))
      .for("update")
      .limit(1);

    return rows[0] ?? null;
  }

  async updateRefreshTokenRotated(
    db: AppDatabase,
    params: {
      tokenId: string;
      replacedById: string;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(refreshTokens)
      .set({
        rotatedAt: new Date(),
        replacedById: params.replacedById,
        version: sql`${refreshTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(refreshTokens.id, params.tokenId), isNull(refreshTokens.deletedAt)));
  }

  async updateRefreshTokenRevoked(
    db: AppDatabase,
    params: {
      tokenId: string;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        version: sql`${refreshTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(and(eq(refreshTokens.id, params.tokenId), isNull(refreshTokens.deletedAt)));
  }

  async updateRefreshTokenFamilyRevoked(
    db: AppDatabase,
    params: {
      familyId: string;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        version: sql`${refreshTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(refreshTokens.familyId, params.familyId),
          isNull(refreshTokens.deletedAt),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  async updateRefreshTokensRevokedForUser(
    db: AppDatabase,
    params: {
      userId: string;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(refreshTokens)
      .set({
        revokedAt: new Date(),
        version: sql`${refreshTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(refreshTokens.userId, params.userId),
          isNull(refreshTokens.deletedAt),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }

  async createPasswordResetToken(
    db: AppDatabase,
    params: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      actorId?: string;
    },
  ): Promise<PasswordResetTokenRow> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(passwordResetTokens)
      .set({
        consumedAt: new Date(),
        version: sql`${passwordResetTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(passwordResetTokens.userId, params.userId),
          isNull(passwordResetTokens.deletedAt),
          isNull(passwordResetTokens.consumedAt),
        ),
      );

    const [created] = await db
      .insert(passwordResetTokens)
      .values({
        userId: params.userId,
        tokenHash: params.tokenHash,
        expiresAt: params.expiresAt,
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create password reset token");
    }

    return created;
  }

  async findPasswordResetTokenByHash(
    db: AppDatabase,
    tokenHash: string,
  ): Promise<PasswordResetTokenRow | null> {
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async updatePasswordResetTokenConsumed(
    db: AppDatabase,
    params: {
      tokenId: string;
      actorId?: string;
    },
  ): Promise<void> {
    const auditActorId = toAuditActorId(params.actorId);

    await db
      .update(passwordResetTokens)
      .set({
        consumedAt: new Date(),
        version: sql`${passwordResetTokens.version} + 1`,
        updatedAt: new Date(),
        updatedBy: auditActorId,
      })
      .where(
        and(
          eq(passwordResetTokens.id, params.tokenId),
          isNull(passwordResetTokens.deletedAt),
        ),
      );
  }

  async findTrustedDeviceByHash(
    db: AppDatabase,
    tokenHash: string,
    now: Date,
  ): Promise<{ device: TrustedDeviceRow; email: string } | null> {
    const rows = await db
      .select({ device: trustedDevices, email: users.email })
      .from(trustedDevices)
      .innerJoin(users, eq(users.id, trustedDevices.userId))
      .where(and(eq(trustedDevices.tokenHash, tokenHash), gt(trustedDevices.expiresAt, now)))
      .limit(1);

    return rows[0] ?? null;
  }

  async createTrustedDevice(
    db: AppDatabase,
    input: Pick<TrustedDeviceRow, "userId" | "tokenHash" | "userAgent" | "expiresAt">,
  ): Promise<void> {
    await db.insert(trustedDevices).values(input);
  }

  async updateTrustedDeviceLastUsed(db: AppDatabase, deviceId: string, at: Date): Promise<void> {
    await db.update(trustedDevices).set({ lastUsedAt: at }).where(eq(trustedDevices.id, deviceId));
  }

  async deleteTrustedDevice(db: AppDatabase, userId: string, tokenHash: string): Promise<void> {
    await db
      .delete(trustedDevices)
      .where(and(eq(trustedDevices.userId, userId), eq(trustedDevices.tokenHash, tokenHash)));
  }

  async deleteTrustedDevicesForUser(db: AppDatabase, userId: string): Promise<void> {
    await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
  }

  async deleteExpiredTrustedDevices(db: AppDatabase, userId: string, now: Date): Promise<void> {
    await db
      .delete(trustedDevices)
      .where(and(eq(trustedDevices.userId, userId), lte(trustedDevices.expiresAt, now)));
  }

  /**
   * Returns the latest active block of the given keys.
   */
  async findAttemptBlockedUntil(
    db: AppDatabase,
    keyHashes: string[],
    now: Date,
  ): Promise<Date | null> {
    const rows = await db
      .select({ blockedUntil: authAttempts.blockedUntil })
      .from(authAttempts)
      .where(and(inArray(authAttempts.keyHash, keyHashes), gt(authAttempts.blockedUntil, now)));

    return rows.reduce<Date | null>(
      (latest, { blockedUntil }) =>
        blockedUntil && (!latest || blockedUntil > latest) ? blockedUntil : latest,
      null,
    );
  }

  /**
   * Counts one attempt atomically. Reaching `max` blocks the key; a block ends the window, so the
   * count starts over once it expires.
   */
  async updateAttempt(db: AppDatabase, input: UpdateAuthAttemptInput): Promise<void> {
    const windowExpired = sql`${authAttempts.windowExpiresAt} <= ${input.now}::timestamptz`;
    const nextCount = sql`case when ${windowExpired} then 1 else ${authAttempts.count} + 1 end`;
    const reachedMax = sql`${nextCount} >= ${input.max}`;

    await db
      .insert(authAttempts)
      .values({
        keyHash: input.keyHash,
        action: input.action,
        count: 1,
        windowExpiresAt: input.windowExpiresAt,
      })
      .onConflictDoUpdate({
        target: authAttempts.keyHash,
        set: {
          count: nextCount,
          blockedUntil: sql`case
            when ${reachedMax} then ${input.blockedUntil}::timestamptz
            when ${windowExpired} then null
            else ${authAttempts.blockedUntil}
          end`,
          windowExpiresAt: sql`case
            when ${reachedMax} then ${input.blockedUntil}::timestamptz
            when ${windowExpired} then ${input.windowExpiresAt}::timestamptz
            else ${authAttempts.windowExpiresAt}
          end`,
        },
      });
  }

  async deleteAttempt(db: AppDatabase, keyHash: string): Promise<void> {
    await db.delete(authAttempts).where(eq(authAttempts.keyHash, keyHash));
  }

  async deleteExpiredAttempts(db: AppDatabase, now: Date): Promise<void> {
    await db.delete(authAttempts).where(lte(authAttempts.windowExpiresAt, now));
  }
}
