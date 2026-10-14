import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { campaignMemberships } from "#src/modules/campaigns/domain/entities/CampaignsTable";

export type CampaignMembershipRow = typeof campaignMemberships.$inferSelect;

export class CampaignMembershipsRepository {
  async findById(
    db: AppDatabase,
    campaignId: string,
    membershipId: string,
  ): Promise<CampaignMembershipRow | null> {
    const [membership] = await db
      .select()
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.id, membershipId),
          eq(campaignMemberships.campaignId, campaignId),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .limit(1);

    return membership ?? null;
  }

  async findActiveByUser(
    db: AppDatabase,
    campaignId: string,
    userId: string,
  ): Promise<CampaignMembershipRow | null> {
    const [membership] = await db
      .select()
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignId),
          eq(campaignMemberships.userId, userId),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .limit(1);

    return membership ?? null;
  }

  async listActiveByCampaign(
    db: AppDatabase,
    campaignId: string,
  ): Promise<CampaignMembershipRow[]> {
    return db
      .select()
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignId),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .orderBy(campaignMemberships.createdAt, campaignMemberships.id);
  }

  async countActiveEditors(db: AppDatabase, campaignId: string): Promise<number> {
    const [result] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(campaignMemberships)
      .where(
        and(
          eq(campaignMemberships.campaignId, campaignId),
          eq(campaignMemberships.role, "EDITOR"),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      );

    return result?.total ?? 0;
  }

  async createPending(
    db: AppDatabase,
    input: { actorId: string; campaignId: string; userId: string; role: "EDITOR" | "PLAYER" },
  ): Promise<CampaignMembershipRow> {
    const [membership] = await db
      .insert(campaignMemberships)
      .values({
        campaignId: input.campaignId,
        userId: input.userId,
        role: input.role,
        status: "PENDING",
        joinedAt: null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();

    if (!membership) {
      throw new Error("Failed to create pending campaign membership");
    }

    return membership;
  }

  async createActiveFromInvitation(
    db: AppDatabase,
    input: { actorId: string; campaignId: string; userId: string; role: "EDITOR" | "PLAYER" },
  ): Promise<CampaignMembershipRow> {
    const [membership] = await db
      .insert(campaignMemberships)
      .values({
        campaignId: input.campaignId,
        userId: input.userId,
        role: input.role,
        status: "ACTIVE",
        joinedAt: new Date(),
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();

    if (!membership) {
      throw new Error("Failed to create campaign membership from invitation");
    }

    return membership;
  }

  async activatePending(
    db: AppDatabase,
    input: { campaignId: string; userId: string; actorId: string },
  ): Promise<CampaignMembershipRow | null> {
    const [membership] = await db
      .update(campaignMemberships)
      .set({
        status: "ACTIVE",
        joinedAt: new Date(),
        version: sql`${campaignMemberships.version} + 1`,
        updatedAt: new Date(),
        updatedBy: input.actorId,
      })
      .where(
        and(
          eq(campaignMemberships.campaignId, input.campaignId),
          eq(campaignMemberships.userId, input.userId),
          eq(campaignMemberships.status, "PENDING"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .returning();

    return membership ?? null;
  }

  async updateRole(
    db: AppDatabase,
    input: {
      campaignId: string;
      membershipId: string;
      actorId: string;
      expectedVersion: number;
      role: "EDITOR" | "PLAYER";
    },
  ): Promise<CampaignMembershipRow | null> {
    const [membership] = await db
      .update(campaignMemberships)
      .set({
        role: input.role,
        version: input.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: input.actorId,
      })
      .where(
        and(
          eq(campaignMemberships.id, input.membershipId),
          eq(campaignMemberships.campaignId, input.campaignId),
          eq(campaignMemberships.status, "ACTIVE"),
          eq(campaignMemberships.version, input.expectedVersion),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .returning();

    return membership ?? null;
  }

  async revoke(
    db: AppDatabase,
    input: { campaignId: string; membershipId: string; actorId: string },
  ): Promise<CampaignMembershipRow | null> {
    const [membership] = await db
      .update(campaignMemberships)
      .set({
        status: "REVOKED",
        revokedAt: new Date(),
        revokedBy: input.actorId,
        version: sql`${campaignMemberships.version} + 1`,
        updatedAt: new Date(),
        updatedBy: input.actorId,
      })
      .where(
        and(
          eq(campaignMemberships.id, input.membershipId),
          eq(campaignMemberships.campaignId, input.campaignId),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .returning();

    return membership ?? null;
  }

}
