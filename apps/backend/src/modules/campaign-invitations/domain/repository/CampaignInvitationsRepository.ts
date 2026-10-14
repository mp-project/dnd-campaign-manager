import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { campaignInvitations } from "#src/modules/campaign-invitations/domain/entities/CampaignInvitationsTable";

export type CampaignInvitationRow = typeof campaignInvitations.$inferSelect;

export class CampaignInvitationsRepository {
  async findByTokenHashForUpdate(
    db: AppDatabase,
    tokenHash: string,
  ): Promise<CampaignInvitationRow | null> {
    const [invitation] = await db
      .select()
      .from(campaignInvitations)
      .where(and(eq(campaignInvitations.tokenHash, tokenHash), isNull(campaignInvitations.deletedAt)))
      .for("update")
      .limit(1);

    return invitation ?? null;
  }

  async findPendingByCampaignEmail(
    db: AppDatabase,
    campaignId: string,
    email: string,
  ): Promise<CampaignInvitationRow | null> {
    const [invitation] = await db
      .select()
      .from(campaignInvitations)
      .where(
        and(
          eq(campaignInvitations.campaignId, campaignId),
          eq(campaignInvitations.email, email),
          eq(campaignInvitations.status, "PENDING"),
          isNull(campaignInvitations.deletedAt),
        ),
      )
      .limit(1);

    return invitation ?? null;
  }

  async create(
    db: AppDatabase,
    input: {
      campaignId: string;
      email: string;
      targetUserId: string | null;
      role: "EDITOR" | "PLAYER";
      tokenHash: string;
      expiresAt: Date;
      actorId: string;
    },
  ): Promise<CampaignInvitationRow> {
    const [invitation] = await db
      .insert(campaignInvitations)
      .values({
        campaignId: input.campaignId,
        email: input.email,
        targetUserId: input.targetUserId,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        invitedBy: input.actorId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();

    if (!invitation) {
      throw new Error("Failed to create campaign invitation");
    }

    return invitation;
  }

  async expirePending(
    db: AppDatabase,
    now: Date,
    campaignId?: string,
  ): Promise<void> {
    const conditions = [
      eq(campaignInvitations.status, "PENDING"),
      lte(campaignInvitations.expiresAt, now),
      isNull(campaignInvitations.deletedAt),
    ];

    if (campaignId) {
      conditions.push(eq(campaignInvitations.campaignId, campaignId));
    }

    await db
      .update(campaignInvitations)
      .set({
        status: "EXPIRED",
        version: sql`${campaignInvitations.version} + 1`,
        updatedAt: now,
      })
      .where(and(...conditions));
  }

  async listPendingByCampaign(
    db: AppDatabase,
    campaignId: string,
    now: Date,
  ): Promise<CampaignInvitationRow[]> {
    return db
      .select()
      .from(campaignInvitations)
      .where(
        and(
          eq(campaignInvitations.campaignId, campaignId),
          eq(campaignInvitations.status, "PENDING"),
          gt(campaignInvitations.expiresAt, now),
          isNull(campaignInvitations.deletedAt),
        ),
      );
  }

  async listPendingForUser(
    db: AppDatabase,
    input: { userId: string; email: string; now: Date },
  ): Promise<CampaignInvitationRow[]> {
    return db
      .select()
      .from(campaignInvitations)
      .where(
        and(
          eq(campaignInvitations.status, "PENDING"),
          gt(campaignInvitations.expiresAt, input.now),
          isNull(campaignInvitations.deletedAt),
          or(
            eq(campaignInvitations.targetUserId, input.userId),
            eq(campaignInvitations.email, input.email),
          ),
        ),
      );
  }

  async markAccepted(
    db: AppDatabase,
    input: { invitationId: string; actorId: string; now: Date },
  ): Promise<CampaignInvitationRow | null> {
    const [updated] = await db
      .update(campaignInvitations)
      .set({
        status: "ACCEPTED",
        acceptedBy: input.actorId,
        acceptedAt: input.now,
        version: sql`${campaignInvitations.version} + 1`,
        updatedAt: input.now,
        updatedBy: input.actorId,
      })
      .where(
        and(
          eq(campaignInvitations.id, input.invitationId),
          eq(campaignInvitations.status, "PENDING"),
          gt(campaignInvitations.expiresAt, input.now),
          isNull(campaignInvitations.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async markRevoked(
    db: AppDatabase,
    input: { campaignId: string; invitationId: string; actorId: string; now: Date },
  ): Promise<CampaignInvitationRow | null> {
    const [updated] = await db
      .update(campaignInvitations)
      .set({
        status: "REVOKED",
        revokedAt: input.now,
        version: sql`${campaignInvitations.version} + 1`,
        updatedAt: input.now,
        updatedBy: input.actorId,
      })
      .where(
        and(
          eq(campaignInvitations.id, input.invitationId),
          eq(campaignInvitations.campaignId, input.campaignId),
          eq(campaignInvitations.status, "PENDING"),
          isNull(campaignInvitations.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }
}