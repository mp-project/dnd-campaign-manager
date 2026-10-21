import {
  and,
  asc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { decodePaginationCursor } from "#core/http/listResponse";
import {
  assetFamilies,
  assetRulesets,
  assets,
} from "#src/modules/assets/domain/entities/AssetsTable";
import type {
  AssetStatus,
  AssetType,
} from "#src/modules/assets/domain/dto/BaseAssetDto";

export type AssetRow = typeof assets.$inferSelect;
export type AssetFamilyRow = typeof assetFamilies.$inferSelect;

export type AssetRecord = {
  asset: AssetRow;
  rulesetIds: string[];
};

export type AssetPage = {
  items: AssetRecord[];
  hasMore: boolean;
};

type PageInput = {
  limit: number;
  cursor?: string | undefined;
  search?: string | undefined;
};

export type CampaignAssetListFilter = PageInput & {
  campaignId: string;
  assetType?: AssetType | undefined;
  statuses?: readonly AssetStatus[] | undefined;
  visibleAssetIds?: readonly string[] | undefined;
};

export type AssetCatalogFilter = PageInput & {
  assetType: AssetType;
  rulesetId: string | null;
  campaign: {
    campaignId: string;
    statuses: readonly AssetStatus[];
    visibleAssetIds?: readonly string[] | undefined;
  } | null;
};

export type CreateAssetInput = Pick<
  typeof assets.$inferInsert,
  | "assetType"
  | "title"
  | "slug"
  | "summary"
  | "status"
  | "scope"
  | "origin"
  | "campaignId"
  | "assetFamilyId"
  | "rulesetPolicy"
  | "sourceReference"
>;

type AssetInsert = typeof assets.$inferInsert;
type UpdatableAssetField =
  | "title"
  | "slug"
  | "summary"
  | "status"
  | "assetFamilyId"
  | "rulesetPolicy"
  | "sourceReference";

export type UpdateAssetPatch = {
  [Key in UpdatableAssetField]?: AssetInsert[Key] | undefined;
};

function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export class AssetsRepository {
  async findById(db: AppDatabase, assetId: string): Promise<AssetRow | null> {
    const [row] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findFamilyById(db: AppDatabase, familyId: string): Promise<AssetFamilyRow | null> {
    const [row] = await db
      .select()
      .from(assetFamilies)
      .where(and(eq(assetFamilies.id, familyId), isNull(assetFamilies.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async listRulesetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    if (assetIds.length === 0) {
      return result;
    }

    const rows = await db
      .select({ assetId: assetRulesets.assetId, rulesetId: assetRulesets.rulesetId })
      .from(assetRulesets)
      .where(and(inArray(assetRulesets.assetId, [...assetIds]), isNull(assetRulesets.deletedAt)))
      .orderBy(asc(assetRulesets.createdAt), asc(assetRulesets.rulesetId));

    for (const row of rows) {
      const list = result.get(row.assetId) ?? [];
      list.push(row.rulesetId);
      result.set(row.assetId, list);
    }

    return result;
  }

  async create(
    db: AppDatabase,
    params: { actorId: string; values: CreateAssetInput },
  ): Promise<AssetRow> {
    const [created] = await db
      .insert(assets)
      .values({
        ...params.values,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create asset");
    }

    return created;
  }

  /**
   * Makes the active ruleset links of an asset match `rulesetIds`
   * (soft-deletes removed links, inserts missing ones).
   */
  async updateRulesets(
    db: AppDatabase,
    params: { assetId: string; actorId: string; rulesetIds: readonly string[] },
  ): Promise<void> {
    const keep = [...new Set(params.rulesetIds)];
    const now = new Date();

    await db
      .update(assetRulesets)
      .set({ deletedAt: now, updatedAt: now, updatedBy: params.actorId })
      .where(
        and(
          eq(assetRulesets.assetId, params.assetId),
          isNull(assetRulesets.deletedAt),
          keep.length > 0 ? notInArray(assetRulesets.rulesetId, keep) : undefined,
        ),
      );

    if (keep.length === 0) {
      return;
    }

    const existing = await db
      .select({ rulesetId: assetRulesets.rulesetId })
      .from(assetRulesets)
      .where(and(eq(assetRulesets.assetId, params.assetId), isNull(assetRulesets.deletedAt)));
    const existingIds = new Set(existing.map((row) => row.rulesetId));
    const missing = keep.filter((rulesetId) => !existingIds.has(rulesetId));

    if (missing.length === 0) {
      return;
    }

    await db.insert(assetRulesets).values(
      missing.map((rulesetId) => ({
        assetId: params.assetId,
        rulesetId,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })),
    );
  }

  async countActiveRulesets(db: AppDatabase, assetId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(assetRulesets)
      .where(and(eq(assetRulesets.assetId, assetId), isNull(assetRulesets.deletedAt)));

    return row?.total ?? 0;
  }

  async update(
    db: AppDatabase,
    params: {
      assetId: string;
      actorId: string;
      expectedVersion: number;
      patch: UpdateAssetPatch;
    },
  ): Promise<AssetRow | null> {
    const [updated] = await db
      .update(assets)
      .set({
        ...params.patch,
        version: params.expectedVersion + 1,
        updatedAt: new Date(),
        updatedBy: params.actorId,
      })
      .where(
        and(
          eq(assets.id, params.assetId),
          eq(assets.version, params.expectedVersion),
          isNull(assets.deletedAt),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async listCampaignAssets(
    db: AppDatabase,
    filter: CampaignAssetListFilter,
  ): Promise<AssetPage> {
    if (filter.visibleAssetIds && filter.visibleAssetIds.length === 0) {
      return { items: [], hasMore: false };
    }

    const where: (SQL | undefined)[] = [
      isNull(assets.deletedAt),
      eq(assets.scope, "CAMPAIGN"),
      eq(assets.campaignId, filter.campaignId),
      filter.assetType ? eq(assets.assetType, filter.assetType) : undefined,
      filter.statuses ? inArray(assets.status, [...filter.statuses]) : undefined,
      filter.visibleAssetIds ? inArray(assets.id, [...filter.visibleAssetIds]) : undefined,
      ...this.buildPageWhere(filter),
    ];

    return this.loadPage(db, where, filter.limit);
  }

  async countCampaignAssets(
    db: AppDatabase,
    filter: Omit<CampaignAssetListFilter, "cursor" | "limit">,
  ): Promise<number> {
    if (filter.visibleAssetIds && filter.visibleAssetIds.length === 0) {
      return 0;
    }

    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(assets)
      .where(
        and(
          isNull(assets.deletedAt),
          eq(assets.scope, "CAMPAIGN"),
          eq(assets.campaignId, filter.campaignId),
          filter.assetType ? eq(assets.assetType, filter.assetType) : undefined,
          filter.statuses ? inArray(assets.status, [...filter.statuses]) : undefined,
          filter.visibleAssetIds ? inArray(assets.id, [...filter.visibleAssetIds]) : undefined,
          filter.search ? ilike(assets.title, containsPattern(filter.search)) : undefined,
        ),
      );

    return row?.total ?? 0;
  }

  /**
   * Lists selectable definitions: active system assets plus (optionally) assets of one campaign,
   * both restricted to definitions compatible with `rulesetId` when given.
   */
  async listCatalog(db: AppDatabase, filter: AssetCatalogFilter): Promise<AssetPage> {
    const systemCondition = and(eq(assets.scope, "SYSTEM"), eq(assets.status, "ACTIVE"));
    const campaignCondition = this.buildCatalogCampaignCondition(filter.campaign);

    const where: (SQL | undefined)[] = [
      isNull(assets.deletedAt),
      eq(assets.assetType, filter.assetType),
      campaignCondition ? or(systemCondition, campaignCondition) : systemCondition,
      filter.rulesetId ? this.compatibleWith(db, filter.rulesetId) : undefined,
      ...this.buildPageWhere(filter),
    ];

    return this.loadPage(db, where, filter.limit);
  }

  /**
   * Lists non-archived variants of a family that are compatible with the ruleset,
   * restricted (explicitly mapped) variants first.
   */
  async listFamilyVariants(
    db: AppDatabase,
    params: { assetFamilyId: string; rulesetId: string; campaignId: string | null },
  ): Promise<AssetRow[]> {
    return db
      .select()
      .from(assets)
      .where(
        and(
          isNull(assets.deletedAt),
          eq(assets.assetFamilyId, params.assetFamilyId),
          sql`${assets.status} <> 'ARCHIVED'`,
          params.campaignId
            ? or(eq(assets.scope, "SYSTEM"), eq(assets.campaignId, params.campaignId))
            : eq(assets.scope, "SYSTEM"),
          this.compatibleWith(db, params.rulesetId),
        ),
      )
      .orderBy(
        sql`case when ${assets.rulesetPolicy} = 'RESTRICTED' then 0 else 1 end`,
        sql`case when ${assets.scope} = 'CAMPAIGN' then 0 else 1 end`,
        asc(assets.createdAt),
      );
  }

  async isCompatible(db: AppDatabase, assetId: string, rulesetId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, assetId), this.compatibleWith(db, rulesetId)))
      .limit(1);

    return Boolean(row);
  }

  private compatibleWith(db: AppDatabase, rulesetId: string): SQL {
    return or(
      eq(assets.rulesetPolicy, "NEUTRAL"),
      exists(
        db
          .select({ one: sql`1` })
          .from(assetRulesets)
          .where(
            and(
              eq(assetRulesets.assetId, assets.id),
              eq(assetRulesets.rulesetId, rulesetId),
              isNull(assetRulesets.deletedAt),
            ),
          ),
      ),
    ) as SQL;
  }

  private buildCatalogCampaignCondition(
    campaign: AssetCatalogFilter["campaign"],
  ): SQL | undefined {
    if (!campaign) {
      return undefined;
    }

    if (campaign.visibleAssetIds && campaign.visibleAssetIds.length === 0) {
      return undefined;
    }

    return and(
      eq(assets.scope, "CAMPAIGN"),
      eq(assets.campaignId, campaign.campaignId),
      inArray(assets.status, [...campaign.statuses]),
      campaign.visibleAssetIds ? inArray(assets.id, [...campaign.visibleAssetIds]) : undefined,
    );
  }

  private buildPageWhere(input: PageInput): (SQL | undefined)[] {
    const where: (SQL | undefined)[] = [];

    if (input.search) {
      where.push(ilike(assets.title, containsPattern(input.search)));
    }

    if (input.cursor) {
      const cursor = decodePaginationCursor(input.cursor);
      const title = String(cursor.sortValue);

      where.push(
        or(gt(assets.title, title), and(eq(assets.title, title), gt(assets.id, cursor.id))),
      );
    }

    return where;
  }

  private async loadPage(
    db: AppDatabase,
    where: (SQL | undefined)[],
    limit: number,
  ): Promise<AssetPage> {
    const rows = await db
      .select()
      .from(assets)
      .where(and(...where))
      .orderBy(asc(assets.title), asc(assets.id))
      .limit(limit + 1);

    const pageRows = rows.slice(0, limit);
    const rulesetIdsByAsset = await this.listRulesetIds(
      db,
      pageRows.map((row) => row.id),
    );

    return {
      items: pageRows.map((asset) => ({
        asset,
        rulesetIds: rulesetIdsByAsset.get(asset.id) ?? [],
      })),
      hasMore: rows.length > limit,
    };
  }
}
