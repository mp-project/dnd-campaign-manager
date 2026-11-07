import { and, asc, eq, gt, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

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
  /** Global classes with these statuses; omitted means none. */
  system?: { statuses: readonly AssetStatus[]; rulesetCondition?: SQL | undefined } | undefined;
  /** Classes of this campaign with these statuses; omitted means none. */
  campaign?:
    | {
        campaignId: string;
        statuses: readonly AssetStatus[];
        /** Only these assets, e.g. those a player may see. */
        assetIds?: readonly string[] | undefined;
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

    if (filter.system && filter.system.statuses.length > 0) {
      scopes.push(
        and(
          isNull(classes.campaignId),
          inArray(assets.status, [...filter.system.statuses]),
          filter.system.rulesetCondition,
        ) as SQL,
      );
    }

    if (
      filter.campaign &&
      filter.campaign.statuses.length > 0 &&
      filter.campaign.assetIds?.length !== 0
    ) {
      scopes.push(
        and(
          eq(classes.campaignId, filter.campaign.campaignId),
          inArray(assets.status, [...filter.campaign.statuses]),
          filter.campaign.assetIds
            ? inArray(classes.assetId, [...filter.campaign.assetIds])
            : undefined,
        ) as SQL,
      );
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
   * Classes whose definition contains the asset id anywhere: grants, upgrade targets, bound
   * parameter values, choice options, equipment, proficiencies, spell lists. `campaignId` limits
   * them to global classes and those of the campaign; null searches everywhere, for global assets.
   * Archived classes only with `includeArchived`.
   */
  async listReferencing(
    db: AppDatabase,
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
  ): Promise<ClassWithAsset[]> {
    const definition = sql`jsonb_build_array(${classes.proficiencies}, ${classes.startingEquipment}, ${classes.levels}, ${classes.choices}, ${classes.spellcasting})`;

    return this.selectWithAsset(db)
      .where(
        and(
          isNull(classes.deletedAt),
          input.campaignId
            ? or(isNull(classes.campaignId), eq(classes.campaignId, input.campaignId))
            : undefined,
          input.includeArchived ? undefined : sql`${assets.status} <> 'ARCHIVED'`,
          sql`jsonb_path_exists(${definition}, '$.** ? (@ == $id)', jsonb_build_object('id', ${input.assetId}::text))`,
        ),
      )
      .orderBy(asc(classes.code), asc(classes.id));
  }

  /** Active custom classes of the campaign released to its players. */
  async listReleased(db: AppDatabase, campaignId: string): Promise<ClassWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(classes.deletedAt),
        eq(classes.campaignId, campaignId),
        eq(assets.status, "ACTIVE"),
        eq(assets.releasedToPlayers, true),
      ),
    );
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
