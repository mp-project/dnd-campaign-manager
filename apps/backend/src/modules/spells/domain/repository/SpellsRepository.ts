import { and, asc, eq, gt, ilike, inArray, isNull, lte, ne, or, type SQL, sql } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { decodeStringCursor } from "#core/http/listResponse";
import type { EffectPayloadType } from "#core/rules/contracts";
import { assets, type AssetRow } from "#src/modules/assets/index";
import { spellLists, spells } from "#src/modules/spells/domain/entities/SpellsTable";

export type SpellRow = typeof spells.$inferSelect;
export type SpellListRow = typeof spellLists.$inferSelect;

/** A spell with its asset, which holds name, summary, status and rulesets. */
export type SpellWithAsset = { spell: SpellRow; asset: AssetRow };
export type SpellRecord = SpellWithAsset & { rulesetIds: readonly string[] };
export type SpellPage = { items: SpellWithAsset[]; hasMore: boolean };

export type SpellListWithAsset = { spellList: SpellListRow; asset: AssetRow };
export type SpellListRecord = SpellListWithAsset & { rulesetIds: readonly string[] };
export type SpellListPage = { items: SpellListWithAsset[]; hasMore: boolean };

/** Spells of one list in a campaign: the list's own entries and the spells that name it. */
export type SpellListMembership = { listAssetId: string; entryIds: readonly string[] };

export type SpellListFilter = {
  limit: number;
  cursor?: string | undefined;
  level?: number | undefined;
  maxLevel?: number | undefined;
  school?: SpellRow["school"] | undefined;
  ritual?: boolean | undefined;
  concentration?: boolean | undefined;
  component?: "VERBAL" | "SOMATIC" | "MATERIAL" | undefined;
  effect?: EffectPayloadType | undefined;
  search?: string | undefined;
  /** Only spells that belong to each of these lists; null stands for a list that matches nothing. */
  memberOf?: readonly (SpellListMembership | null)[] | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

const jsonArray = (values: readonly unknown[]) => sql`${JSON.stringify(values)}::jsonb`;

/** Cursor of a spell page: level and code, then id. */
export function encodeSpellSortValue(row: Pick<SpellRow, "level" | "code">): string {
  return `${row.level}:${row.code}`;
}

/** Spell rows only change through the history; reads join the asset they belong to. */
export class SpellsRepository {
  async findById(db: AppDatabase, spellId: string): Promise<SpellWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(spells.id, spellId), isNull(spells.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, SpellWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(spells.assetId, [...new Set(assetIds)]), isNull(spells.deletedAt)),
    );

    return new Map(rows.map((row) => [row.spell.assetId, row]));
  }

  /** Other global spells with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptSpellId: string },
  ): Promise<SpellWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(spells.deletedAt),
        isNull(spells.campaignId),
        eq(spells.code, input.code),
        ne(spells.id, input.exceptSpellId),
      ),
    );
  }

  async listPage(db: AppDatabase, filter: SpellListFilter): Promise<SpellPage> {
    const componentColumn = {
      VERBAL: spells.componentVerbal,
      SOMATIC: spells.componentSomatic,
      MATERIAL: spells.componentMaterial,
    };
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(spells.deletedAt),
          filter.where,
          filter.level !== undefined ? eq(spells.level, filter.level) : undefined,
          filter.maxLevel !== undefined ? lte(spells.level, filter.maxLevel) : undefined,
          filter.school ? eq(spells.school, filter.school) : undefined,
          filter.ritual !== undefined ? eq(spells.isRitual, filter.ritual) : undefined,
          filter.concentration !== undefined
            ? eq(spells.requiresConcentration, filter.concentration)
            : undefined,
          filter.component ? eq(componentColumn[filter.component], true) : undefined,
          filter.effect
            ? sql`${spells.effects} @> ${jsonArray([{ payload: { type: filter.effect } }])}`
            : undefined,
          ...(filter.memberOf ?? []).map((list) => this.membershipWhere(list)),
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(spells.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(spells.level), asc(spells.code), asc(spells.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /**
   * Custom spells that belong to active released custom lists of the campaign: their own entries
   * and the spells that name such a list. Read straight from the stored json, so one list that no
   * longer parses can't break what players see elsewhere.
   */
  async listReleasedEntryIds(db: AppDatabase, campaignId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
      with released as (
        select ${spellLists.assetId} as asset_id, ${spellLists.spellIds} as spell_ids
        from ${spellLists}
        join ${assets} on ${assets.id} = ${spellLists.assetId} and ${assets.deletedAt} is null
        where ${spellLists.deletedAt} is null
          and ${spellLists.campaignId} = ${campaignId}
          and ${assets.status} = 'ACTIVE'
          and ${assets.releasedToPlayers} = true
      )
      select entry.id
      from released
      cross join lateral jsonb_array_elements_text(
        case when jsonb_typeof(released.spell_ids) = 'array' then released.spell_ids else '[]'::jsonb end
      ) as entry(id)
      union
      select ${spells.assetId}::text
      from ${spells}
      join released on ${spells.spellListIds} @> jsonb_build_array(released.asset_id::text)
      where ${spells.deletedAt} is null
        and ${spells.campaignId} = ${campaignId}
    `);

    return rows.rows.map((row) => row.id);
  }

  private membershipWhere(list: SpellListMembership | null): SQL {
    if (list === null) {
      return sql`false`;
    }

    return or(
      list.entryIds.length > 0 ? inArray(spells.assetId, [...list.entryIds]) : undefined,
      sql`${spells.spellListIds} @> ${jsonArray([list.listAssetId])}`,
    ) as SQL;
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ spell: spells, asset: assets })
      .from(spells)
      .innerJoin(assets, and(eq(assets.id, spells.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);
    const separator = value.indexOf(":");
    const level = Number(value.slice(0, separator));
    const code = value.slice(separator + 1);

    if (separator < 0 || !Number.isInteger(level)) {
      throw new ValidationError("Invalid cursor");
    }

    return or(
      gt(spells.level, level),
      and(eq(spells.level, level), gt(spells.code, code)),
      and(eq(spells.level, level), eq(spells.code, code), gt(spells.id, id)),
    );
  }
}

/** Spell list rows only change through the history; reads join the asset they belong to. */
export class SpellListsRepository {
  async findById(db: AppDatabase, spellListId: string): Promise<SpellListWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(spellLists.id, spellListId), isNull(spellLists.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, SpellListWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await this.selectWithAsset(db).where(
      and(inArray(spellLists.assetId, [...new Set(assetIds)]), isNull(spellLists.deletedAt)),
    );

    return new Map(rows.map((row) => [row.spellList.assetId, row]));
  }

  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptSpellListId: string },
  ): Promise<SpellListWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(
        isNull(spellLists.deletedAt),
        isNull(spellLists.campaignId),
        eq(spellLists.code, input.code),
        ne(spellLists.id, input.exceptSpellListId),
      ),
    );
  }

  /** Lists that hold the spell as one of their own entries. */
  async listContaining(db: AppDatabase, spellAssetId: string): Promise<SpellListWithAsset[]> {
    return this.selectWithAsset(db)
      .where(
        and(
          isNull(spellLists.deletedAt),
          sql`${spellLists.spellIds} @> ${jsonArray([spellAssetId])}`,
        ),
      )
      .orderBy(asc(spellLists.code), asc(spellLists.id));
  }

  async listPage(
    db: AppDatabase,
    filter: { limit: number; cursor?: string | undefined; search?: string | undefined; where: SQL },
  ): Promise<SpellListPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(spellLists.deletedAt),
          filter.where,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(spellLists.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(spellLists.code), asc(spellLists.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ spellList: spellLists, asset: assets })
      .from(spellLists)
      .innerJoin(assets, and(eq(assets.id, spellLists.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(spellLists.code, value), and(eq(spellLists.code, value), gt(spellLists.id, id)));
  }
}

/** Keeps two transactions from giving global content of one kind the same code at the same time. */
export async function lockSystemCode(db: AppDatabase, kind: "spells" | "spell-lists", code: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`${kind}.code:${code}`}))`);
}
