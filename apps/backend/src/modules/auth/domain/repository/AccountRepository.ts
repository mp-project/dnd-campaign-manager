import { and, count, eq, isNull, sql } from "drizzle-orm";

import { toAuditActorId } from "#core/db/auditActor";
import type { AppDatabase } from "#core/db/pool";
import type { SystemRole } from "#core/permissions/roles";
import { users, userSettings } from "#src/modules/users/domain/entities/UsersTable";

export type AccountRow = typeof users.$inferSelect;

/**
 * The auth module's writes to `users`: creating and linking local accounts for identities of the
 * provider and keeping the copied address in step. They have no history (see CLAUDE.md, History).
 */
export class AccountRepository {
  async findByClerkUserId(db: AppDatabase, clerkUserId: string): Promise<AccountRow | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findByEmail(db: AppDatabase, email: string): Promise<AccountRow | null> {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async userTagExists(db: AppDatabase, userTag: string): Promise<boolean> {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.userTag, userTag))
      .limit(1);

    return Boolean(row);
  }

  async countActiveWithRole(db: AppDatabase, systemRole: SystemRole): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.systemRole, systemRole), isNull(users.deletedAt)));

    return row?.value ?? 0;
  }

  /**
   * Inserts the account unless another request created it a moment before (any unique index:
   * provider id, address or tag); then nothing is returned and the caller reads it again.
   */
  async create(
    db: AppDatabase,
    input: {
      clerkUserId: string;
      email: string;
      emailVerifiedAt: Date | null;
      displayName: string;
      username: string;
      userTag: string;
      systemRole: SystemRole;
    },
  ): Promise<AccountRow | null> {
    const auditActorId = toAuditActorId(null);
    const [row] = await db
      .insert(users)
      .values({
        ...input,
        status: "ACTIVE",
        lastLoginAt: new Date(),
        createdBy: auditActorId,
        updatedBy: auditActorId,
      })
      .onConflictDoNothing()
      .returning();

    return row ?? null;
  }

  async createSettings(
    db: AppDatabase,
    input: { userId: string; locale: string | undefined; timezone: string | undefined },
  ): Promise<void> {
    const auditActorId = toAuditActorId(input.userId);

    await db.insert(userSettings).values({
      userId: input.userId,
      ...(input.locale ? { locale: input.locale } : {}),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      createdBy: auditActorId,
      updatedBy: auditActorId,
    });
  }

  async update(
    db: AppDatabase,
    userId: string,
    set: Partial<
      Pick<
        AccountRow,
        | "clerkUserId"
        | "email"
        | "emailVerifiedAt"
        | "systemRole"
        | "status"
        | "lastLoginAt"
        | "deletedAt"
      >
    >,
  ): Promise<AccountRow | null> {
    const [row] = await db
      .update(users)
      .set({
        ...set,
        version: sql`${users.version} + 1`,
        updatedAt: new Date(),
        updatedBy: toAuditActorId(userId),
      })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning();

    return row ?? null;
  }
}
