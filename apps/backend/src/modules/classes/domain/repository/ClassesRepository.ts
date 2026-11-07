import { and, type AnyColumn, asc, eq, gt, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow, type AssetStatus } from "#src/modules/assets/index";
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
  /**
   * Global classes with these statuses, plus the archived ones among `archivedAssetIds`; omitted
   * means none.
   */
  system?:
    | {
        statuses: readonly AssetStatus[];
        archivedAssetIds?: readonly string[] | undefined;
        rulesetCondition?: SQL | undefined;
      }
    | undefined;
  /**
   * Classes of this campaign with these statuses (only `assetIds` if given, e.g. those a player
   * may see), plus the archived ones among `archivedAssetIds`; omitted means none.
   */
  campaign?:
    | {
        campaignId: string;
        statuses: readonly AssetStatus[];
        assetIds?: readonly string[] | undefined;
        archivedAssetIds?: readonly string[] | undefined;
      }
    | undefined;
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

  async listPage(db: AppDatabase, filter: ClassListFilter): Promise<ClassPage> {
    const scopes: SQL[] = [];
    const archivedAmong = (assetIds: readonly string[] | undefined) =>
      assetIds && assetIds.length > 0
        ? and(eq(assets.status, "ARCHIVED"), inArray(classes.assetId, [...assetIds]))
        : undefined;
    const withStatuses = (statuses: readonly AssetStatus[], assetIds?: readonly string[]) =>
      statuses.length > 0 && assetIds?.length !== 0
        ? and(
            inArray(assets.status, [...statuses]),
            assetIds ? inArray(classes.assetId, [...assetIds]) : undefined,
          )
        : undefined;

    if (filter.system) {
      const status = or(
        withStatuses(filter.system.statuses),
        archivedAmong(filter.system.archivedAssetIds),
      );

      if (status) {
        scopes.push(
          and(isNull(classes.campaignId), status, filter.system.rulesetCondition) as SQL,
        );
      }
    }

    if (filter.campaign) {
      const status = or(
        withStatuses(filter.campaign.statuses, filter.campaign.assetIds),
        archivedAmong(filter.campaign.archivedAssetIds),
      );

      if (status) {
        scopes.push(and(eq(classes.campaignId, filter.campaign.campaignId), status) as SQL);
      }
    }

    if (scopes.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(classes.deletedAt),
          or(...scopes),
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
   * Classes whose definition refers to the asset: grants, upgrade targets, static bound values,
   * choice options, equipment, proficiency options and spell lists. Only these paths count, so text
   * that happens to look like the id is no usage. `campaignId` limits them to global classes and
   * those of the campaign; null searches everywhere, for global assets. Archived classes only with
   * `includeArchived`.
   */
  async listReferencing(
    db: AppDatabase,
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
  ): Promise<ClassWithAsset[]> {
    const vars = sql`jsonb_build_object('id', ${input.assetId}::text)`;
    const at = (column: AnyColumn, path: string) =>
      sql`jsonb_path_exists(${column}, ${path}::jsonpath, ${vars})`;

    return this.selectWithAsset(db)
      .where(
        and(
          isNull(classes.deletedAt),
          input.campaignId
            ? or(isNull(classes.campaignId), eq(classes.campaignId, input.campaignId))
            : undefined,
          input.includeArchived ? undefined : sql`${assets.status} <> 'ARCHIVED'`,
          or(
            at(classes.proficiencies, "$[*].options[*].assetId ? (@ == $id)"),
            at(classes.startingEquipment, "$[*].entries[*].itemAssetId ? (@ == $id)"),
            at(classes.levels, "$[*].featureGrants[*].featureAssetId ? (@ == $id)"),
            at(classes.levels, "$[*].featureGrants[*].targetFeatureAssetId ? (@ == $id)"),
            at(
              classes.levels,
              '$[*].featureGrants[*].bindings[*] ? (@.bindingSource == "STATIC" && @.staticValue == $id)',
            ),
            at(classes.choices, "$[*].options[*].linkedAssetId ? (@ == $id)"),
            at(classes.spellcasting, "$.spellListAssetId ? (@ == $id)"),
          ),
        ),
      )
      .orderBy(asc(classes.code), asc(classes.id));
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
