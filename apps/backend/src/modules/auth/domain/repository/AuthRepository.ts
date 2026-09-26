import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  emailVerificationRequests,
  users,
} from "#src/modules/users/domain/entities/UsersTable";
import type { OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  passwordResetTokens,
  refreshTokens,
} from "#src/modules/auth/domain/entities/AuthTable";
import { toAuditActorId } from "#src/modules/users/helpers/Audit";

export type UserRow = typeof users.$inferSelect;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationRequestRow = typeof emailVerificationRequests.$inferSelect;

export type CreateUserInput = {
  email: string;
  displayName: string;
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

  async createUser(db: AppDatabase, input: CreateUserInput): Promise<UserRow> {
    const auditActorId = toAuditActorId(input.actorId);
    const values: typeof users.$inferInsert = {
      email: input.email,
      displayName: input.displayName,
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

  async setOAuthIdentity(
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

  async markRefreshTokenRotated(
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

  async revokeRefreshTokenById(
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

  async revokeRefreshTokenFamily(
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

  async revokeAllRefreshTokensForUser(
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

  async consumePasswordResetToken(
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
}
