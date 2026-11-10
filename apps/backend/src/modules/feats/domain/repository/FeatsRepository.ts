import { and, asc, eq, gt, ilike, inArray, isNull, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow } from "#src/modules/assets/index";
import { feats } from "#src/modules/feats/domain/entities/FeatsTable";
import type { FeatCategory } from "#src/modules/feats/domain/FeatDefinition";

export type FeatRow = typeof feats.$inferSelect;

/** A feat with its asset, which holds name, summary, status and rulesets. */
export type FeatWithAsset = { feat: FeatRow; asset: AssetRow };

export type FeatRecord = FeatWithAsset & { rulesetIds: readonly string[] };

export type FeatPage = { items: FeatWithAsset[]; hasMore: boolean };

export type FeatListFilter = {
  limit: number;
  cursor?: string | undefined;
  category?: FeatCategory | undefined;
  level?: number | undefined;
  repeatable?: boolean | undefined;
  search?: string | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

/** Feat rows only change through the history; reads join the asset they belong to. */
export class FeatsRepository {
  async findById(db: AppDatabase, featId: string): Promise<FeatWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(feats.id, featId), isNull(feats.deletedAt)),
    );

    return row ?? null;
  }

  /**
   * With `lock: "share"` the feat rows and their assets stay locked until the transaction ends, so
   * neither the definition nor the status can change under a caller that depends on them.
   */
  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
    options: { lock?: "share" } = {},
  ): Promise<Map<string, FeatWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const query = this.selectWithAsset(db)
      .where(and(inArray(feats.assetId, [...new Set(assetIds)]), isNull(feats.deletedAt)))
      // Sorted, so parallel callers lock rows in the same order.
      .orderBy(asc(feats.assetId));
    const rows = options.lock === "share" ? await query.for("share") : await query;

    return new Map(rows.map((row) => [row.feat.assetId, row]));
  }

  /** Other global feats with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptFeatId: string },
  ): Promise<FeatWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(feats.deletedAt),
        isNull(feats.campaignId),
        eq(feats.code, input.code),
        ne(feats.id, input.exceptFeatId),
      ),
    );
  }

  /** Keeps two transactions from giving global feats the same code at the same time. */
  async lockSystemCode(db: AppDatabase, code: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`feats.code:${code}`}))`);
  }

  /**
   * Serializes changes to feat prerequisites, so two actions cannot make two feats require each
   * other at the same time; each sees the other's change before checking for cycles.
   */
  async lockPrerequisiteGraph(db: AppDatabase): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('feats.prerequisites'))`);
  }

  async listPage(db: AppDatabase, filter: FeatListFilter): Promise<FeatPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(feats.deletedAt),
          filter.where,
          filter.category ? eq(feats.category, filter.category) : undefined,
          filter.level !== undefined
            ? or(isNull(feats.minimumCharacterLevel), lte(feats.minimumCharacterLevel, filter.level))
            : undefined,
          filter.repeatable === undefined
            ? undefined
            : filter.repeatable
              ? sql`${feats.repeatability} ->> 'mode' <> 'ONCE'`
              : sql`${feats.repeatability} ->> 'mode' = 'ONCE'`,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(feats.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(feats.code), asc(feats.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Asset ids that active released custom feats of the campaign grant, upgrade or offer as choice
   * options. Read straight from the stored json, so a definition that no longer parses cannot
   * break what players see elsewhere.
   */
  async listReleasedReferencedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select distinct ids.id
      from ${feats}
      join ${assets} on ${assets.id} = ${feats.assetId} and ${assets.deletedAt} is null
      cross join lateral (
        select jsonb_path_query(${feats.featureGrants}, '$[*].featureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${feats.featureGrants}, '$[*].targetFeatureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${feats.choices}, '$[*].options[*].linkedAssetId') #>> '{}'
      ) as ids(id)
      where ${feats.deletedAt} is null
        and ${feats.campaignId} = ${campaignId}
        and ${assets.status} = 'ACTIVE'
        and ${assets.releasedToPlayers} = true
        and ids.id is not null
    `);

    return rows.rows.map((row) => row.id);
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ feat: feats, asset: assets })
      .from(feats)
      .innerJoin(assets, and(eq(assets.id, feats.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(feats.code, value), and(eq(feats.code, value), gt(feats.id, id)));
  }
}
