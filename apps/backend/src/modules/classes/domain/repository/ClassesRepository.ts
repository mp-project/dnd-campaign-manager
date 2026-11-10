import { and, asc, eq, gt, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow } from "#src/modules/assets/index";
import type { ClassHitDie } from "#src/modules/classes/domain/dto/BaseClassDto";
import type { CastingType } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { classes } from "#src/modules/classes/domain/entities/ClassesTable";

export type ClassRow = typeof classes.$inferSelect;

/** A class with its asset, which holds name, summary, status and rulesets. */
export type ClassWithAsset = { characterClass: ClassRow; asset: AssetRow };

export type ClassRecord = ClassWithAsset & { rulesetIds: readonly string[] };

export type ClassPage = { items: ClassWithAsset[]; hasMore: boolean };

export type ClassListFilter = {
  limit: number;
  cursor?: string | undefined;
  hitDie?: ClassHitDie | undefined;
  spellcastingType?: CastingType | undefined;
  search?: string | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

/** Class rows only change through the history; reads join the asset they belong to. */
export class ClassesRepository {
  async findById(db: AppDatabase, classId: string): Promise<ClassWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(classes.id, classId), isNull(classes.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, ClassWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(classes.assetId, [...new Set(assetIds)]), isNull(classes.deletedAt)),
    );

    return new Map(rows.map((row) => [row.characterClass.assetId, row]));
  }

  /** Other active global classes with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptClassId: string },
  ): Promise<ClassWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(classes.deletedAt),
        isNull(classes.campaignId),
        eq(classes.code, input.code),
        ne(classes.id, input.exceptClassId),
      ),
    );
  }

  /** Keeps two transactions from giving global classes the same code at the same time. */
  async lockSystemCode(db: AppDatabase, code: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`classes.code:${code}`}))`);
  }

  /** Keeps the class row from changing until the transaction ends; other share locks still pass. */
  async lockShared(db: AppDatabase, classId: string): Promise<void> {
    await db.execute(sql`select 1 from ${classes} where ${classes.id} = ${classId} for share`);
  }

  async listPage(db: AppDatabase, filter: ClassListFilter): Promise<ClassPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(classes.deletedAt),
          filter.where,
          filter.hitDie ? eq(classes.hitDie, filter.hitDie) : undefined,
          filter.spellcastingType
            ? sql`coalesce(${classes.spellcasting} ->> 'castingType', 'NONE') = ${filter.spellcastingType}`
            : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(classes.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(classes.code), asc(classes.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Asset ids that active released custom classes of the campaign grant, upgrade or offer as choice
   * options. Read straight from the stored json, so a definition that no longer parses cannot break
   * what players see elsewhere.
   */
  async listReleasedReferencedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select distinct ids.id
      from ${classes}
      join ${assets} on ${assets.id} = ${classes.assetId} and ${assets.deletedAt} is null
      cross join lateral (
        select jsonb_path_query(${classes.levels}, '$[*].featureGrants[*].featureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${classes.levels}, '$[*].featureGrants[*].targetFeatureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${classes.choices}, '$[*].options[*].linkedAssetId') #>> '{}'
      ) as ids(id)
      where ${classes.deletedAt} is null
        and ${classes.campaignId} = ${campaignId}
        and ${assets.status} = 'ACTIVE'
        and ${assets.releasedToPlayers} = true
        and ids.id is not null
    `);

    return rows.rows.map((row) => row.id);
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ characterClass: classes, asset: assets })
      .from(classes)
      .innerJoin(assets, and(eq(assets.id, classes.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(classes.code, value), and(eq(classes.code, value), gt(classes.id, id)));
  }
}
