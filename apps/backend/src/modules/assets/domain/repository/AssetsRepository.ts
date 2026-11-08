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
import { systemRuntimeState } from "#core/db/schemas/runtimeState.table";
import { decodePaginationCursor } from "#core/http/listResponse";
import {
  assetFamilies,
  assetReferences,
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

export type AssetListFilter = PageInput & {
  assetType?: AssetType | undefined;
  /** Which assets, e.g. `ContentAccess.listWhere`. */
  where: SQL;
};

/** Active global assets of a type, for the catalog outside a campaign. */
export type AssetCatalogFilter = PageInput & {
  assetType: AssetType;
  rulesetId: string | null;
};

function containsPattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const REFERENCE_INDEX_STATE_KEY = "content.reference_index";

/** One row of `asset_references`. */
export type StoredAssetReference = {
  targetAssetId: string;
  path: string;
  kind: string;
  forbids: readonly string[];
};

export class AssetsRepository {
  async findById(db: AppDatabase, assetId: string): Promise<AssetRow | null> {
    const [row] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async findByIds(db: AppDatabase, assetIds: readonly string[]): Promise<AssetRow[]> {
    if (assetIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(assets)
      .where(and(inArray(assets.id, [...assetIds]), isNull(assets.deletedAt)));
  }

  /** Sorted, so parallel callers lock rows in the same order. */
  async findByIdForUpdate(db: AppDatabase, assetId: string): Promise<AssetRow | null> {
    const [row] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), isNull(assets.deletedAt)))
      .for("update");

    return row ?? null;
  }

  async lockShared(db: AppDatabase, assetIds: readonly string[]): Promise<void> {
    await db
      .select({ id: assets.id })
      .from(assets)
      .where(inArray(assets.id, [...assetIds]))
      .orderBy(asc(assets.id))
      .for("share");
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

  async listPage(db: AppDatabase, filter: AssetListFilter): Promise<AssetPage> {
    const where: (SQL | undefined)[] = [
      isNull(assets.deletedAt),
      filter.where,
      filter.assetType ? eq(assets.assetType, filter.assetType) : undefined,
      ...this.buildPageWhere(filter),
    ];

    return this.loadPage(db, where, filter.limit);
  }

  async count(db: AppDatabase, filter: Omit<AssetListFilter, "cursor" | "limit">): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(assets)
      .where(
        and(
          isNull(assets.deletedAt),
          filter.where,
          filter.assetType ? eq(assets.assetType, filter.assetType) : undefined,
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
    const where: (SQL | undefined)[] = [
      isNull(assets.deletedAt),
      eq(assets.assetType, filter.assetType),
      eq(assets.scope, "SYSTEM"),
      eq(assets.status, "ACTIVE"),
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

  /** Those of the assets that fit the ruleset. */
  async listCompatibleIds(
    db: AppDatabase,
    assetIds: readonly string[],
    rulesetId: string,
  ): Promise<Set<string>> {
    if (assetIds.length === 0) {
      return new Set();
    }

    const rows = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(inArray(assets.id, [...new Set(assetIds)]), this.compatibleWith(db, rulesetId)));

    return new Set(rows.map((row) => row.id));
  }

  /** Active custom assets released to the players of the campaign. */
  async listReleasedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db
      .select({ id: assets.id })
      .from(assets)
      .where(
        and(
          eq(assets.campaignId, campaignId),
          eq(assets.releasedToPlayers, true),
          eq(assets.status, "ACTIVE"),
          isNull(assets.deletedAt),
        ),
      );

    return rows.map((row) => row.id);
  }

  /** Replaces what the stored content of the asset refers to. */
  async replaceReferences(
    db: AppDatabase,
    sourceAssetId: string,
    references: readonly StoredAssetReference[],
  ): Promise<void> {
    await db.delete(assetReferences).where(eq(assetReferences.sourceAssetId, sourceAssetId));

    if (references.length > 0) {
      await db.insert(assetReferences).values(
        references.map((reference) => ({
          sourceAssetId,
          targetAssetId: reference.targetAssetId,
          path: reference.path,
          kind: reference.kind,
          forbids: [...reference.forbids],
        })),
      );
    }
  }

  async deleteReferences(db: AppDatabase, sourceAssetIds: readonly string[]): Promise<void> {
    if (sourceAssetIds.length > 0) {
      await db
        .delete(assetReferences)
        .where(inArray(assetReferences.sourceAssetId, [...sourceAssetIds]));
    }
  }

  /** Existing assets whose stored content refers to the target, with how; ordered by source. */
  async listReferencing(
    db: AppDatabase,
    targetAssetId: string,
  ): Promise<{ source: AssetRow; reference: StoredAssetReference }[]> {
    const rows = await db
      .select({ source: assets, reference: assetReferences })
      .from(assetReferences)
      .innerJoin(
        assets,
        and(eq(assets.id, assetReferences.sourceAssetId), isNull(assets.deletedAt)),
      )
      .where(eq(assetReferences.targetAssetId, targetAssetId))
      .orderBy(asc(assets.title), asc(assets.id), asc(assetReferences.path));

    return rows.map(({ source, reference }) => ({ source, reference }));
  }

  /** What non-archived content of these types in the campaign refers to, with the user. */
  async listUsedTargets(
    db: AppDatabase,
    campaignId: string,
    sourceTypes: readonly AssetType[],
  ): Promise<{ source: AssetRow; targetAssetId: string }[]> {
    if (sourceTypes.length === 0) {
      return [];
    }

    return db
      .select({ source: assets, targetAssetId: assetReferences.targetAssetId })
      .from(assetReferences)
      .innerJoin(assets, eq(assets.id, assetReferences.sourceAssetId))
      .where(
        and(
          isNull(assets.deletedAt),
          eq(assets.campaignId, campaignId),
          inArray(assets.assetType, [...sourceTypes]),
          sql`${assets.status} <> 'ARCHIVED'`,
        ),
      );
  }

  /** Serializes rebuilding the reference index across app instances, until the transaction ends. */
  async lockReferenceIndex(db: AppDatabase): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${REFERENCE_INDEX_STATE_KEY}))`);
  }

  async findReferenceIndexVersion(db: AppDatabase): Promise<number | null> {
    const [row] = await db
      .select({ value: systemRuntimeState.value })
      .from(systemRuntimeState)
      .where(
        and(
          eq(systemRuntimeState.stateKey, REFERENCE_INDEX_STATE_KEY),
          isNull(systemRuntimeState.deletedAt),
        ),
      );
    const version = (row?.value as { version?: unknown } | undefined)?.version;

    return typeof version === "number" ? version : null;
  }

  async updateReferenceIndexVersion(db: AppDatabase, version: number): Promise<void> {
    const updated = await db
      .update(systemRuntimeState)
      .set({ value: { version }, updatedAt: new Date() })
      .where(
        and(
          eq(systemRuntimeState.stateKey, REFERENCE_INDEX_STATE_KEY),
          isNull(systemRuntimeState.deletedAt),
        ),
      )
      .returning({ id: systemRuntimeState.id });

    if (updated.length === 0) {
      await db.insert(systemRuntimeState).values({ stateKey: REFERENCE_INDEX_STATE_KEY, value: { version } });
    }
  }

  /** Assets of these types, archived ones included, for rebuilding the references. */
  async listIdsOfTypes(db: AppDatabase, assetTypes: readonly AssetType[]): Promise<string[]> {
    if (assetTypes.length === 0) {
      return [];
    }

    const rows = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(isNull(assets.deletedAt), inArray(assets.assetType, [...assetTypes])))
      .orderBy(asc(assets.id));

    return rows.map((row) => row.id);
  }

  /** Condition on `assets`: global assets with these statuses, fitting the ruleset if given. */
  globalWhere(
    db: AppDatabase,
    filter: { statuses: readonly AssetStatus[]; rulesetId?: string | undefined },
  ): SQL {
    return and(
      eq(assets.scope, "SYSTEM"),
      filter.statuses.length > 0 ? inArray(assets.status, [...filter.statuses]) : sql`false`,
      filter.rulesetId ? this.compatibleWith(db, filter.rulesetId) : undefined,
    ) as SQL;
  }

  /** Condition on `assets`: neutral, or restricted to a set that contains the ruleset. */
  compatibleWith(db: AppDatabase, rulesetId: string): SQL {
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
