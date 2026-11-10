import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lt, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { decodeStringCursor } from "#core/http/listResponse";
import type { EffectPayloadType } from "#core/rules/contracts";
import { assets, type AssetRow } from "#src/modules/assets/index";
import {
  itemInstanceKnowledge,
  itemInstances,
  items,
} from "#src/modules/items/domain/entities/ItemsTable";

export type ItemRow = typeof items.$inferSelect;
export type ItemInstanceRow = typeof itemInstances.$inferSelect;
export type ItemKnowledgeRow = typeof itemInstanceKnowledge.$inferSelect;

/** An item with its asset, which holds name, summary, status and rulesets. */
export type ItemWithAsset = { item: ItemRow; asset: AssetRow };
export type ItemRecord = ItemWithAsset & { rulesetIds: readonly string[] };
export type ItemPage = { items: ItemWithAsset[]; hasMore: boolean };

export type ItemListFilter = {
  limit: number;
  cursor?: string | undefined;
  category?: ItemRow["category"] | undefined;
  rarity?: NonNullable<ItemRow["rarity"]> | undefined;
  weaponCategory?: NonNullable<ItemRow["weaponCategory"]> | undefined;
  armorCategory?: NonNullable<ItemRow["armorCategory"]> | undefined;
  magical?: boolean | undefined;
  attunement?: ItemRow["attunementMode"] | undefined;
  effect?: EffectPayloadType | undefined;
  search?: string | undefined;
  /** Which entries, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
};

const jsonArray = (values: readonly unknown[]) => sql`${JSON.stringify(values)}::jsonb`;

/** Item rows only change through the history; reads join the asset they belong to. */
export class ItemsRepository {
  async findById(db: AppDatabase, itemId: string): Promise<ItemWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(and(eq(items.id, itemId), isNull(items.deletedAt)));

    return row ?? null;
  }

  /**
   * With `lock: "share"` the item rows and their assets stay locked until the transaction ends, so
   * neither the definition nor the status can change under a caller that depends on them.
   */
  async findByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
    options: { lock?: "share" } = {},
  ): Promise<Map<string, ItemWithAsset>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const query = this.selectWithAsset(db)
      .where(and(inArray(items.assetId, [...new Set(assetIds)]), isNull(items.deletedAt)))
      // Sorted, so parallel callers lock rows in the same order.
      .orderBy(asc(items.assetId));
    const rows = options.lock === "share" ? await query.for("share") : await query;

    return new Map(rows.map((row) => [row.item.assetId, row]));
  }

  /** Other global items with this code, with their assets; for the code check per ruleset. */
  async listSystemByCode(
    db: AppDatabase,
    input: { code: string; exceptItemId: string },
  ): Promise<ItemWithAsset[]> {
    return this.selectWithAsset(db).where(
      and(isNull(items.deletedAt), isNull(items.campaignId), eq(items.code, input.code), ne(items.id, input.exceptItemId)),
    );
  }

  async listPage(db: AppDatabase, filter: ItemListFilter): Promise<ItemPage> {
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(items.deletedAt),
          filter.where,
          filter.category ? eq(items.category, filter.category) : undefined,
          filter.rarity ? eq(items.rarity, filter.rarity) : undefined,
          filter.weaponCategory ? eq(items.weaponCategory, filter.weaponCategory) : undefined,
          filter.armorCategory ? eq(items.armorCategory, filter.armorCategory) : undefined,
          filter.magical !== undefined ? eq(items.isMagical, filter.magical) : undefined,
          filter.attunement ? eq(items.attunementMode, filter.attunement) : undefined,
          filter.effect ? sql`${items.effects} @> ${jsonArray([{ payload: { type: filter.effect } }])}` : undefined,
          filter.search
            ? or(
                ilike(assets.title, `%${escapeLike(filter.search)}%`),
                ilike(items.code, `%${escapeLike(filter.search)}%`),
              )
            : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(items.code), asc(items.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ item: items, asset: assets })
      .from(items)
      .innerJoin(assets, and(eq(assets.id, items.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(items.code, value), and(eq(items.code, value), gt(items.id, id)));
  }
}

export type ItemInstanceListFilter = {
  campaignId: string;
  limit: number;
  cursor?: string | undefined;
  itemAssetId?: string | undefined;
  ownerType?: ItemInstanceRow["ownerType"] | undefined;
  ownerAssetId?: string | undefined;
  equipped?: boolean | undefined;
  attuned?: boolean | undefined;
  search?: string | undefined;
  /**
   * Players: only instances this player knows of (seen or identified), and `search` only matches
   * the name the player knows. The use case refuses the other filters for players.
   */
  knownBy?: string | undefined;
};

export type ItemInstancePage = { items: ItemInstanceRow[]; hasMore: boolean };

/** Creation time cut to what a cursor can carry (JavaScript dates know milliseconds only). */
const createdAtMs = sql<Date>`date_trunc('milliseconds', ${itemInstances.createdAt})`;

/** Instance and knowledge rows only change through the history. */
export class ItemInstancesRepository {
  async findById(db: AppDatabase, instanceId: string): Promise<ItemInstanceRow | null> {
    const [row] = await db
      .select()
      .from(itemInstances)
      .where(and(eq(itemInstances.id, instanceId), isNull(itemInstances.deletedAt)));

    return row ?? null;
  }

  /**
   * Instances of a campaign, newest first. `knownBy` keeps those a player knows of: the player's
   * own knowledge entry when there is one, otherwise the entry for all players.
   */
  async listPage(db: AppDatabase, filter: ItemInstanceListFilter): Promise<ItemInstancePage> {
    const definition = alias(assets, "definition");
    const rows = await db
      .select({ instance: itemInstances })
      .from(itemInstances)
      .innerJoin(definition, eq(definition.id, itemInstances.itemAssetId))
      .where(
        and(
          isNull(itemInstances.deletedAt),
          eq(itemInstances.campaignId, filter.campaignId),
          filter.itemAssetId ? eq(itemInstances.itemAssetId, filter.itemAssetId) : undefined,
          filter.ownerType ? eq(itemInstances.ownerType, filter.ownerType) : undefined,
          filter.ownerAssetId ? eq(itemInstances.ownerAssetId, filter.ownerAssetId) : undefined,
          filter.equipped !== undefined ? eq(itemInstances.equipped, filter.equipped) : undefined,
          filter.attuned !== undefined ? eq(itemInstances.attuned, filter.attuned) : undefined,
          filter.search
            ? filter.knownBy === undefined
              ? or(
                  ilike(itemInstances.customName, `%${escapeLike(filter.search)}%`),
                  ilike(definition.title, `%${escapeLike(filter.search)}%`),
                )
              : // Players search only the name they know it by, never the GM's name or the definition.
                this.knownNameMatches(filter.knownBy, filter.search)
            : undefined,
          filter.knownBy !== undefined ? this.knownByWhere(filter.knownBy) : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(desc(createdAtMs), desc(itemInstances.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit).map((row) => row.instance), hasMore: rows.length > filter.limit };
  }

  /** Active instances of a definition; they keep it from being archived. */
  async countActiveOfItem(db: AppDatabase, itemAssetId: string): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(itemInstances)
      .where(and(eq(itemInstances.itemAssetId, itemAssetId), isNull(itemInstances.deletedAt)));

    return row?.total ?? 0;
  }

  /** Instances an actor is attuned to, apart from one; with `itemAssetId` only copies of that item. */
  async countAttuned(
    db: AppDatabase,
    input: { ownerAssetId: string; exceptInstanceId: string; itemAssetId?: string },
  ): Promise<number> {
    const [row] = await db
      .select({ total: count() })
      .from(itemInstances)
      .where(
        and(
          isNull(itemInstances.deletedAt),
          eq(itemInstances.ownerAssetId, input.ownerAssetId),
          eq(itemInstances.attuned, true),
          ne(itemInstances.id, input.exceptInstanceId),
          input.itemAssetId !== undefined ? eq(itemInstances.itemAssetId, input.itemAssetId) : undefined,
        ),
      );

    return row?.total ?? 0;
  }

  async listKnowledge(db: AppDatabase, instanceIds: readonly string[]): Promise<ItemKnowledgeRow[]> {
    if (instanceIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(itemInstanceKnowledge)
      .where(and(inArray(itemInstanceKnowledge.instanceId, [...instanceIds]), isNull(itemInstanceKnowledge.deletedAt)))
      .orderBy(asc(itemInstanceKnowledge.createdAt), asc(itemInstanceKnowledge.id));
  }

  async findKnowledge(
    db: AppDatabase,
    input: { instanceId: string; userId: string | null },
  ): Promise<ItemKnowledgeRow | null> {
    const [row] = await db
      .select()
      .from(itemInstanceKnowledge)
      .where(
        and(
          eq(itemInstanceKnowledge.instanceId, input.instanceId),
          input.userId === null ? isNull(itemInstanceKnowledge.userId) : eq(itemInstanceKnowledge.userId, input.userId),
          isNull(itemInstanceKnowledge.deletedAt),
        ),
      );

    return row ?? null;
  }

  /** Keeps two actions from attuning one actor to more items than allowed at the same time. */
  async lockOwner(db: AppDatabase, ownerAssetId: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`item-instances.owner:${ownerAssetId}`}))`);
  }

  /** Keeps two actions from writing the first knowledge entry of a player at the same time. */
  async lockKnowledge(db: AppDatabase, instanceId: string): Promise<void> {
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`item-instances.knowledge:${instanceId}`}))`);
  }

  private knownNameMatches(userId: string, search: string): SQL {
    return sql`coalesce(
      (select own.known_name from ${itemInstanceKnowledge} own
        where own.instance_id = ${itemInstances.id} and own.deleted_at is null and own.user_id = ${userId}),
      (select everyone.known_name from ${itemInstanceKnowledge} everyone
        where everyone.instance_id = ${itemInstances.id} and everyone.deleted_at is null and everyone.user_id is null)
    ) ilike ${`%${escapeLike(search)}%`}`;
  }

  /** The player's own entry decides when there is one, otherwise the entry for all players. */
  private knownByWhere(userId: string): SQL {
    return sql`coalesce(
      (select own.knowledge_level from ${itemInstanceKnowledge} own
        where own.instance_id = ${itemInstances.id} and own.deleted_at is null and own.user_id = ${userId}),
      (select everyone.knowledge_level from ${itemInstanceKnowledge} everyone
        where everyone.instance_id = ${itemInstances.id} and everyone.deleted_at is null and everyone.user_id is null),
      'UNKNOWN'
    ) <> 'UNKNOWN'`;
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);
    const createdAt = new Date(value);

    if (Number.isNaN(createdAt.getTime())) {
      throw new ValidationError("Invalid cursor");
    }

    return or(lt(createdAtMs, createdAt), and(eq(createdAtMs, createdAt), lt(itemInstances.id, id)));
  }
}

/** Keeps two transactions from giving global items the same code at the same time. */
export async function lockSystemCode(db: AppDatabase, code: string) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`items.code:${code}`}))`);
}
