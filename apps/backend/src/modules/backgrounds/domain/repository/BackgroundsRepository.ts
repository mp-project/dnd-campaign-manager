import { and, asc, eq, gt, ilike, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import { assets, type AssetRow } from "#src/modules/assets/index";
import type { AbilityRuleMode } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import { backgrounds } from "#src/modules/backgrounds/domain/entities/BackgroundsTable";
import type { CustomizationMode } from "#src/modules/backgrounds/domain/BackgroundDefinition";

export type BackgroundRow = typeof backgrounds.$inferSelect;

/** A background with its asset, which holds name, summary, status and rulesets. */
export type BackgroundWithAsset = { background: BackgroundRow; asset: AssetRow };

export type BackgroundRecord = BackgroundWithAsset & { rulesetIds: readonly string[] };

export type BackgroundPage = { items: BackgroundWithAsset[]; hasMore: boolean };

export type BackgroundListFilter = {
  limit: number;
  cursor?: string | undefined;
  customizationMode?: CustomizationMode | undefined;
  abilityMode?: AbilityRuleMode | undefined;
  ability?: string | undefined;
  search?: string | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

/** Background rows only change through the history; reads join the asset they belong to. */
export class BackgroundsRepository {
  async findById(db: AppDatabase, backgroundId: string): Promise<BackgroundWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(backgrounds.id, backgroundId), isNull(backgrounds.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, BackgroundWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(backgrounds.assetId, [...new Set(assetIds)]), isNull(backgrounds.deletedAt)),
    );

    return new Map(rows.map((row) => [row.background.assetId, row]));
  }

  /** Other global backgrounds with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptBackgroundId: string },
  ): Promise<BackgroundWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(backgrounds.deletedAt),
        isNull(backgrounds.campaignId),
        eq(backgrounds.code, input.code),
        ne(backgrounds.id, input.exceptBackgroundId),
      ),
    );
  }

  /** Keeps two transactions from giving global backgrounds the same code at the same time. */
  async lockSystemCode(db: AppDatabase, code: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`backgrounds.code:${code}`}))`);
  }

  async listPage(db: AppDatabase, filter: BackgroundListFilter): Promise<BackgroundPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(backgrounds.deletedAt),
          filter.where,
          filter.customizationMode ? eq(backgrounds.customizationMode, filter.customizationMode) : undefined,
          filter.abilityMode ? sql`${backgrounds.abilityRule} ->> 'mode' = ${filter.abilityMode}` : undefined,
          filter.ability
            ? sql`(${backgrounds.abilityRule} -> 'allowedAbilities' ? ${filter.ability}
                or jsonb_path_exists(${backgrounds.abilityRule}, '$.increases[*] ? (@.ability == $ability)',
                  jsonb_build_object('ability', ${filter.ability}::text)))`
            : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(backgrounds.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(backgrounds.code), asc(backgrounds.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Asset ids that active released custom backgrounds of the campaign grant or offer: features,
   * feats, tool and equipment items. Read straight from the stored json, so a definition that no
   * longer parses cannot break what players see elsewhere.
   */
  async listReleasedReferencedIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      select distinct ids.id
      from ${backgrounds}
      join ${assets} on ${assets.id} = ${backgrounds.assetId} and ${assets.deletedAt} is null
      cross join lateral (
        select jsonb_path_query(${backgrounds.featureGrants}, '$[*].featureAssetId') #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.featureGrants}, '$[*].targetFeatureAssetId') #>> '{}'
        union all
        select jsonb_path_query(
          ${backgrounds.featureGrants},
          '$[*].bindings[*] ? (@.bindingSource == "STATIC" && @.staticValue.type() == "string").staticValue'
        ) #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.featGrants}, '$[*].featAssetId') #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.featGrants}, '$[*].optionFilter.featAssetIds[*]') #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.proficiencyGrants}, '$[*].options[*].assetId') #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.equipmentOptions}, '$[*].entries[*].itemAssetId') #>> '{}'
        union all
        select jsonb_path_query(${backgrounds.equipmentOptions}, '$[*].entries[*].choiceFilter.itemAssetIds[*]') #>> '{}'
      ) as ids(id)
      where ${backgrounds.deletedAt} is null
        and ${backgrounds.campaignId} = ${campaignId}
        and ${assets.status} = 'ACTIVE'
        and ${assets.releasedToPlayers} = true
        and ids.id is not null
        -- Bound values may be free text; only ids can be assets.
        and ids.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    `);

    return rows.rows.map((row) => row.id);
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ background: backgrounds, asset: assets })
      .from(backgrounds)
      .innerJoin(assets, and(eq(assets.id, backgrounds.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(backgrounds.code, value), and(eq(backgrounds.code, value), gt(backgrounds.id, id)));
  }
}
