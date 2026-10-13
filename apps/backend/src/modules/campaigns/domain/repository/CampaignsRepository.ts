import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import {
  campaigns,
  campaignMemberships,
  campaignTimeEvents,
} from "#src/modules/campaigns/domain/entities/CampaignsTable";
import type { CreateCampaignDto } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import type { RequestCampaignDto } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import type { UpdateCampaignDto } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";

export type CampaignRow = typeof campaigns.$inferSelect;
export type CampaignMembershipRow = typeof campaignMemberships.$inferSelect;
export type CampaignTimeEventRow = typeof campaignTimeEvents.$inferSelect;

export type CampaignListFilter = RequestCampaignDto["listQuery"];
export type CreateCampaignInput = Omit<CreateCampaignDto, "createdBy">;
export type UpdateCampaignPatch = Omit<UpdateCampaignDto, "expectedVersion">;

export type CampaignAggregate = {
  campaign: CampaignRow;
  membership: CampaignMembershipRow | null;
  isOwner: boolean;
  effectivePermissions: string[];
};

export class CampaignsRepository {
  async insertCampaignWithOwnerMembership(
    db: AppDatabase,
    params: {
      actorId: string;
      ownerUserId: string;
      campaign: CreateCampaignInput & { slug: string };
    },
  ): Promise<CampaignRow> {
    const [createdCampaign] = await db
      .insert(campaigns)
      .values({
        ownerUserId: params.ownerUserId,
        rulesetId: params.campaign.rulesetId,
        name: params.campaign.name,
        slug: params.campaign.slug,
        description: params.campaign.description,
        status: "DRAFT",
        currentGameDay: 0,
        longRestCount: 0,
        settings: params.campaign.settings,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })
      .returning();

    if (!createdCampaign) {
      throw new Error("Failed to create campaign");
    }

    await db.insert(campaignMemberships).values({
      campaignId: createdCampaign.id,
      userId: params.ownerUserId,
      role: "EDITOR",
      createdBy: params.actorId,
      updatedBy: params.actorId,
    });

    return createdCampaign;
  }

  async findCampaignById(db: AppDatabase, campaignId: string): Promise<CampaignRow | null> {
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

  async updateCampaignWithVersion(
    db: AppDatabase,
    params: {
      campaignId: string;
      actorId: string;
      expectedVersion: number;
      patch: UpdateCampaignPatch;
    },
  ): Promise<CampaignRow | null> {
    const updateInput: Partial<typeof campaigns.$inferInsert> & {
      version: number;
      updatedAt: Date;
      updatedBy: string | null;
    } = {
      version: params.expectedVersion + 1,
      updatedAt: new Date(),
      updatedBy: params.actorId,
    };

    if (params.patch.name !== undefined) {
      updateInput.name = params.patch.name;
    }

    if (params.patch.slug !== undefined) {
      updateInput.slug = params.patch.slug;
    }

    if (params.patch.description !== undefined) {
      updateInput.description = params.patch.description;
    }

    if (params.patch.status !== undefined) {
      updateInput.status = params.patch.status;
    }

    if (params.patch.settings !== undefined) {
      updateInput.settings = params.patch.settings;
    }

    const [updated] = await db
      .update(campaigns)
      .set(updateInput)
      .where(
        and(
          eq(campaigns.id, params.campaignId),
          eq(campaigns.version, params.expectedVersion),
          isNull(campaigns.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async softArchiveWithVersion(
    db: AppDatabase,
    params: {
      campaignId: string;
      actorId: string;
      expectedVersion: number;
    },
  ): Promise<CampaignRow | null> {
    const [updated] = await db
      .update(campaigns)
      .set({
        status: "ARCHIVED",
        version: params.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: params.actorId,
      })
      .where(
        and(
          eq(campaigns.id, params.campaignId),
          eq(campaigns.version, params.expectedVersion),
          isNull(campaigns.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async updateTimeWithVersion(
    db: AppDatabase,
    params: {
      campaignId: string;
      actorId: string;
      expectedVersion: number;
      newGameDay: number;
      newLongRestCount: number;
    },
  ): Promise<CampaignRow | null> {
    const [updated] = await db
      .update(campaigns)
      .set({
        currentGameDay: params.newGameDay,
        longRestCount: params.newLongRestCount,
        version: params.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: params.actorId,
      })
      .where(
        and(
          eq(campaigns.id, params.campaignId),
          eq(campaigns.version, params.expectedVersion),
          isNull(campaigns.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async insertTimeEvent(
    db: AppDatabase,
    params: {
      actorId: string;
      campaignId: string;
      type: CampaignTimeEventRow["type"];
      previousGameDay: number;
      newGameDay: number;
      previousLongRestCount: number;
      newLongRestCount: number;
      reason: string | null;
    },
  ): Promise<CampaignTimeEventRow> {
    const [created] = await db
      .insert(campaignTimeEvents)
      .values({
        campaignId: params.campaignId,
        type: params.type,
        previousGameDay: params.previousGameDay,
        newGameDay: params.newGameDay,
        previousLongRestCount: params.previousLongRestCount,
        newLongRestCount: params.newLongRestCount,
        reason: params.reason,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create campaign time event");
    }

    return created;
  }

  async listTimeEvents(
    db: AppDatabase,
    campaignId: string,
    limit: number,
  ): Promise<CampaignTimeEventRow[]> {
    return db
      .select()
      .from(campaignTimeEvents)
      .where(
        and(
          eq(campaignTimeEvents.campaignId, campaignId),
          isNull(campaignTimeEvents.deletedAt),
        ),
      )
      .orderBy(desc(campaignTimeEvents.createdAt), desc(campaignTimeEvents.id))
      .limit(limit);
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
  } | null> {
    const campaign = await this.findCampaignById(input.db, input.campaignId);

    if (!campaign) {
      return null;
    }

    if (!input.actorId) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        campaignMemberId: null,
        membershipActive: false,
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
      };
    }

    if (!membership) {
      return {
        campaignId: campaign.id,
        rulesetId: campaign.rulesetId,
        campaignMemberId: null,
        membershipActive: false,
      };
    }

    return {
      campaignId: campaign.id,
      rulesetId: campaign.rulesetId,
      campaignMemberId: membership.id,
      membershipActive: true,
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
