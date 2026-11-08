import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  campaigns,
  campaignMemberships,
} from "#src/modules/campaigns/domain/entities/CampaignsTable";
import type { RequestCampaignDto } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";

export type CampaignRow = typeof campaigns.$inferSelect;
export type CampaignMembershipRow = typeof campaignMemberships.$inferSelect;

export type CampaignListFilter = RequestCampaignDto["listQuery"];

export type CampaignAggregate = {
  campaign: CampaignRow;
  membership: CampaignMembershipRow | null;
  isOwner: boolean;
  effectivePermissions: string[];
};

export class CampaignsRepository {
  async findMembershipCampaign(db: AppDatabase, campaignId: string) {
    const [campaign] = await db
      .select({
        id: campaigns.id,
        ownerUserId: campaigns.ownerUserId,
        rulesetId: campaigns.rulesetId,
        name: campaigns.name,
      })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
      .limit(1);

    return campaign ?? null;
  }

  async lockCampaign(db: AppDatabase, campaignId: string): Promise<void> {
    await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
      .for("update");
  }

  /** Ruleset of each campaign in one query; unknown and deleted campaigns are missing. */
  async listRulesetIds(db: AppDatabase, campaignIds: readonly string[]): Promise<Map<string, string | null>> {
    if (campaignIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ id: campaigns.id, rulesetId: campaigns.rulesetId })
      .from(campaigns)
      .where(and(inArray(campaigns.id, [...new Set(campaignIds)]), isNull(campaigns.deletedAt)));

    return new Map(rows.map((row) => [row.id, row.rulesetId]));
  }

  async findById(db: AppDatabase, campaignId: string): Promise<CampaignRow | null> {
    const rows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
      .limit(1);

    return rows[0] ?? null;
  }

  async findMembership(
    db: AppDatabase,
    campaignId: string,
    userId: string,
  ): Promise<CampaignMembershipRow | null> {
    const rows = await db
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

    return rows[0] ?? null;
  }

  async listForActor(
    db: AppDatabase,
    actorId: string,
    filter: CampaignListFilter,
  ): Promise<CampaignAggregate[]> {
    const where = this.buildListWhere(filter);

    const rows = await db
      .select({
        campaign: campaigns,
        membership: campaignMemberships,
      })
      .from(campaigns)
      .leftJoin(
        campaignMemberships,
        and(
          eq(campaignMemberships.campaignId, campaigns.id),
          eq(campaignMemberships.userId, actorId),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .where(
        and(
          ...where,
          or(eq(campaigns.ownerUserId, actorId), sql`${campaignMemberships.id} is not null`),
        ),
      )
      .orderBy(asc(campaigns.name), asc(campaigns.createdAt))
      .limit(filter.limit);

    return rows.map((row) => ({
      campaign: row.campaign,
      membership: row.membership,
      isOwner: row.campaign.ownerUserId === actorId,
      effectivePermissions: [],
    }));
  }

  async countForActor(
    db: AppDatabase,
    actorId: string,
    filter: CampaignListFilter,
  ): Promise<number> {
    const where = this.buildListWhere(filter);

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(campaigns)
      .leftJoin(
        campaignMemberships,
        and(
          eq(campaignMemberships.campaignId, campaigns.id),
          eq(campaignMemberships.userId, actorId),
          eq(campaignMemberships.status, "ACTIVE"),
          isNull(campaignMemberships.deletedAt),
        ),
      )
      .where(
        and(
          ...where,
          or(eq(campaigns.ownerUserId, actorId), sql`${campaignMemberships.id} is not null`),
        ),
      );

    return row?.total ?? 0;
  }

  async resolveCampaignAccess(input: {
    db: AppDatabase;
    campaignId: string;
    actorId: string | null;
  }): Promise<{
    campaignId: string;
    rulesetId: string;
    campaignMemberId: string | null;
    membershipActive: boolean;
    campaignRole: "OWNER" | "EDITOR" | "PLAYER" | null;
  } | null> {
    const campaign = await this.findById(input.db, input.campaignId);

    if (!campaign) {
      return null;
    }

    if (!input.actorId) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        campaignMemberId: null,
        membershipActive: false,
        campaignRole: null,
      };
    }

    const membership = await this.findMembership(input.db, campaign.id, input.actorId);
    const isOwner = campaign.ownerUserId === input.actorId;

    if (isOwner) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        campaignMemberId: membership?.id ?? null,
        membershipActive: true,
        campaignRole: "OWNER",
      };
    }

    if (!membership) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        campaignMemberId: null,
        membershipActive: false,
        campaignRole: null,
      };
    }

    return {
      campaignId: campaign.id,
      rulesetId: campaign.rulesetId,
      campaignMemberId: membership.id,
      membershipActive: true,
      campaignRole: membership.role,
    };
  }

  private buildListWhere(filter: CampaignListFilter) {
    const where = [isNull(campaigns.deletedAt)];

    if (filter.status) {
      where.push(eq(campaigns.status, filter.status));
    } else if (!filter.includeArchived) {
      where.push(sql`${campaigns.status} <> 'ARCHIVED'`);
    }

    if (filter.search) {
      const searchCondition = or(
        ilike(campaigns.name, `%${filter.search}%`),
        ilike(campaigns.slug, `%${filter.search}%`),
      );

      if (searchCondition) {
        where.push(searchCondition);
      }
    }

    return where;
  }
}
