import { and, asc, eq, gt, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { decodeNumberCursor } from "#core/http/listResponse";
import { assetTags, tags } from "#src/modules/tags/domain/entities/TagsTable";

export type TagRow = typeof tags.$inferSelect;

export type TagPage = {
  items: TagRow[];
  hasMore: boolean;
};

/** Tag rows only change through the history; `asset_tags` is saved as a list field of the asset. */
export class TagsRepository {
  async findById(db: AppDatabase, tagId: string): Promise<TagRow | null> {
    const [row] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), isNull(tags.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  /** Waits for running assignments, so counting afterwards misses none of them. */
  async lockForDelete(db: AppDatabase, tagId: string): Promise<TagRow | null> {
    const [row] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, tagId), isNull(tags.deletedAt)))
      .for("update");

    return row ?? null;
  }

  /**
   * Active tags of the campaign among `tagIds`, locked until the transaction ends so they cannot be
   * deleted while they are being assigned. Sorted, so parallel callers lock in the same order.
   */
  async lockActiveIds(
    db: AppDatabase,
    campaignId: string,
    tagIds: readonly string[],
  ): Promise<string[]> {
    if (tagIds.length === 0) {
      return [];
    }

    const rows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.campaignId, campaignId),
          inArray(tags.id, [...tagIds]),
          isNull(tags.deletedAt),
        ),
      )
      .orderBy(asc(tags.id))
      .for("share");

    return rows.map((row) => row.id);
  }

  /** With `onAssetIds`, only tags that are assigned to one of these assets. */
  async listPage(
    db: AppDatabase,
    filter: {
      campaignId: string;
      limit: number;
      cursor?: string | undefined;
      onAssetIds?: readonly string[] | undefined;
    },
  ): Promise<TagPage> {
    if (filter.onAssetIds?.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.campaignId, filter.campaignId),
          isNull(tags.deletedAt),
          filter.onAssetIds ? this.assignedTo(filter.onAssetIds) : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(tags.sortOrder), asc(tags.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async listForAsset(db: AppDatabase, assetId: string): Promise<TagRow[]> {
    const rows = await db
      .select({ tag: tags })
      .from(assetTags)
      .innerJoin(tags, eq(tags.id, assetTags.tagId))
      .where(
        and(eq(assetTags.assetId, assetId), isNull(assetTags.deletedAt), isNull(tags.deletedAt)),
      )
      .orderBy(asc(tags.sortOrder), asc(tags.id));

    return rows.map((row) => row.tag);
  }

  async listIdsForAsset(db: AppDatabase, assetId: string): Promise<string[]> {
    const rows = await db
      .select({ tagId: assetTags.tagId })
      .from(assetTags)
      .where(and(eq(assetTags.assetId, assetId), isNull(assetTags.deletedAt)));

    return rows.map((row) => row.tagId);
  }

  async listIdsForAssets(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>(assetIds.map((assetId) => [assetId, []]));

    if (assetIds.length === 0) {
      return result;
    }

    const rows = await db
      .select({ assetId: assetTags.assetId, tagId: assetTags.tagId })
      .from(assetTags)
      .where(and(inArray(assetTags.assetId, [...assetIds]), isNull(assetTags.deletedAt)));

    for (const row of rows) {
      result.get(row.assetId)?.push(row.tagId);
    }

    return result;
  }

  /** Sorted, so parallel callers lock the assets in the same order. */
  async listAssetIdsOfTag(db: AppDatabase, tagId: string): Promise<string[]> {
    const rows = await db
      .select({ assetId: assetTags.assetId })
      .from(assetTags)
      .where(and(eq(assetTags.tagId, tagId), isNull(assetTags.deletedAt)))
      .orderBy(asc(assetTags.assetId));

    return rows.map((row) => row.assetId);
  }

  async countUsages(db: AppDatabase, tagIds: readonly string[]): Promise<Map<string, number>> {
    if (tagIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ tagId: assetTags.tagId, total: sql<number>`count(*)::int` })
      .from(assetTags)
      .where(and(inArray(assetTags.tagId, [...tagIds]), isNull(assetTags.deletedAt)))
      .groupBy(assetTags.tagId);

    return new Map(rows.map((row) => [row.tagId, row.total]));
  }

  async deleteAssetTagsExcept(
    db: AppDatabase,
    params: { assetId: string; keep: readonly string[]; actorId: string },
  ): Promise<void> {
    const now = new Date();

    await db
      .update(assetTags)
      .set({ deletedAt: now, updatedAt: now, updatedBy: params.actorId })
      .where(
        and(
          eq(assetTags.assetId, params.assetId),
          isNull(assetTags.deletedAt),
          params.keep.length > 0 ? notInArray(assetTags.tagId, [...params.keep]) : undefined,
        ),
      );
  }

  async createAssetTags(
    db: AppDatabase,
    params: { campaignId: string; assetId: string; tagIds: readonly string[]; actorId: string },
  ): Promise<void> {
    if (params.tagIds.length === 0) {
      return;
    }

    await db.insert(assetTags).values(
      params.tagIds.map((tagId) => ({
        campaignId: params.campaignId,
        assetId: params.assetId,
        tagId,
        createdBy: params.actorId,
        updatedBy: params.actorId,
      })),
    );
  }

  private assignedTo(assetIds: readonly string[]): SQL {
    return sql`exists (select 1 from ${assetTags} where ${and(
      eq(assetTags.tagId, tags.id),
      inArray(assetTags.assetId, [...assetIds]),
      isNull(assetTags.deletedAt),
    )})`;
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeNumberCursor(cursor);

    return or(gt(tags.sortOrder, value), and(eq(tags.sortOrder, value), gt(tags.id, id)));
  }
}
