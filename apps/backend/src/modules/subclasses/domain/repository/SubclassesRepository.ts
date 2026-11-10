import { and, asc, eq, gt, ilike, inArray, isNull, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow } from "#src/modules/assets/index";
import { classes } from "#src/modules/classes/index";
import { subclasses } from "#src/modules/subclasses/domain/entities/SubclassesTable";

export type SubclassRow = typeof subclasses.$inferSelect;

/** What a subclass shows of its class: its asset and the level range. */
export type SubclassBase = {
  classAssetId: string;
  selectionLevel: number;
  maximumLevel: number;
};

/** A subclass with its asset, which holds name, summary, status and rulesets, and its class. */
export type SubclassWithAsset = { subclass: SubclassRow; asset: AssetRow; base: SubclassBase };

export type SubclassRecord = SubclassWithAsset & { rulesetIds: readonly string[] };

export type SubclassPage = { items: SubclassWithAsset[]; hasMore: boolean };

export type SubclassListFilter = {
  limit: number;
  cursor?: string | undefined;
  classId?: string | undefined;
  search?: string | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

/** Subclass rows only change through the history; reads join their asset and class. */
export class SubclassesRepository {
  async findById(db: AppDatabase, subclassId: string): Promise<SubclassWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(subclasses.id, subclassId), isNull(subclasses.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, SubclassWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(subclasses.assetId, [...new Set(assetIds)]), isNull(subclasses.deletedAt)),
    );

    return new Map(rows.map((row) => [row.subclass.assetId, row]));
  }

  /** Every subclass of a class, in the order they are shown; the caller decides what is readable. */
  async listForClass(db: AppDatabase, classId: string): Promise<SubclassWithAsset[]> {
    return this.selectWithAsset(db)
      .where(and(eq(subclasses.classId, classId), isNull(subclasses.deletedAt)))
      .orderBy(asc(subclasses.displayOrder), asc(subclasses.code), asc(subclasses.id));
  }

  async listPage(db: AppDatabase, filter: SubclassListFilter): Promise<SubclassPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(subclasses.deletedAt),
          filter.where,
          filter.classId ? eq(subclasses.classId, filter.classId) : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(subclasses.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(subclasses.code), asc(subclasses.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Asset ids that active released custom subclasses of the campaign grant, upgrade to, offer as
   * options or give as spells, and their spell lists; only while players may choose the class too
   * (a global one, or an active released one of the campaign), like species variants. Read
   * straight from the stored json, so a definition that no longer parses cannot break what
   * players see elsewhere.
   */
  async listReleasedReferencedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select distinct ids.id
      from ${subclasses}
      join ${assets} on ${assets.id} = ${subclasses.assetId} and ${assets.deletedAt} is null
      join ${classes} on ${classes.id} = ${subclasses.classId}
      join ${assets} as class_asset on class_asset.id = ${classes.assetId}
        and class_asset.deleted_at is null
        and (
          class_asset.campaign_id is null
          or (class_asset.status = 'ACTIVE' and class_asset.released_to_players = true)
        )
      cross join lateral (
        select jsonb_path_query(${subclasses.levels}, '$[*].featureGrants[*].featureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${subclasses.levels}, '$[*].featureGrants[*].targetFeatureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${subclasses.choices}, '$[*].options[*].linkedAssetId') #>> '{}'
        union all
        select jsonb_path_query(${subclasses.spellGrants}, '$[*].spellAssetId') #>> '{}'
        union all
        select ${subclasses.spellcasting} ->> 'spellListAssetId'
      ) as ids(id)
      where ${subclasses.deletedAt} is null
        and ${subclasses.campaignId} = ${campaignId}
        and ${assets.status} = 'ACTIVE'
        and ${assets.releasedToPlayers} = true
        and ids.id is not null
    `);

    return rows.rows.map((row) => row.id);
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({
        subclass: subclasses,
        asset: assets,
        base: {
          classAssetId: classes.assetId,
          selectionLevel: classes.subclassSelectionLevel,
          maximumLevel: classes.maximumLevel,
        },
      })
      .from(subclasses)
      .innerJoin(assets, and(eq(assets.id, subclasses.assetId), isNull(assets.deletedAt)))
      .innerJoin(classes, eq(classes.id, subclasses.classId));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(subclasses.code, value), and(eq(subclasses.code, value), gt(subclasses.id, id)));
  }
}
