import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { campaignMemberships } from "#src/modules/campaigns/domain/entities/CampaignsTable";

export type CampaignMembershipRow = typeof campaignMemberships.$inferSelect;

/**
 * Reads memberships. Writes go through the history, see `trackedMembership` in `CampaignsService`.
 */
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
}
