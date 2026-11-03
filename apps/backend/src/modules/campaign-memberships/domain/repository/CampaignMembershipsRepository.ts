import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { campaignMemberships } from "#src/modules/campaigns/domain/entities/CampaignsTable";

export type CampaignMembershipRow = typeof campaignMemberships.$inferSelect;

/**
 * Creates an active membership (e.g. when an invitation is accepted).
 */
export type CreateCampaignMembershipInput = {
  actorId: string;
  campaignId: string;
  userId: string;
  role: CampaignMembershipRow["role"];
};

export type UpdateCampaignMembershipInput = {
  campaignId: string;
  membershipId: string;
  actorId: string;
  expectedVersion: number;
  role: CampaignMembershipRow["role"];
};

export type DeleteCampaignMembershipInput = {
  campaignId: string;
  membershipId: string;
  actorId: string;
};

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

  async create(
    db: AppDatabase,
    input: CreateCampaignMembershipInput,
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
      throw new Error("Failed to create campaign membership");
    }

    return membership;
  }

  async update(
    db: AppDatabase,
    input: UpdateCampaignMembershipInput,
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

  /**
   * Soft delete: sets the membership to `REVOKED`.
   */
  async delete(
    db: AppDatabase,
    input: DeleteCampaignMembershipInput,
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
