import { and, asc, eq, gt, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";

import { escapeLike } from "#core/db/escapeLike";
import type { AppDatabase } from "#core/db/pool";
import { decodeStringCursor } from "#core/http/listResponse";
import type { RequestActorsQueryDto } from "#src/modules/actors/domain/dto/RequestActorDto";
import { actors } from "#src/modules/actors/domain/entities/ActorsTable";
import { assets, type AssetRow } from "#src/modules/assets/index";

export type ActorRow = typeof actors.$inferSelect;

/** An actor with its asset, which holds name, summary and status, and the ids of its tags. */
export type ActorRecord = { actor: ActorRow; asset: AssetRow; tagIds: readonly string[] };

export type ActorWithAsset = Omit<ActorRecord, "tagIds">;

export type ActorPage = {
  items: ActorWithAsset[];
  hasMore: boolean;
};

export type ActorListFilter = Pick<RequestActorsQueryDto, "category" | "creatureType" | "size" | "search"> & {
  /** Which actors, as a condition on their asset (e.g. `ContentAccess.listWhere`). */
  where: SQL;
  limit: number;
  cursor?: string | undefined;
  /** Only actors of these assets, e.g. those carrying a tag. */
  assetIds?: readonly string[] | undefined;
};

/** Actor rows only change through the history; reads join the asset they belong to. */
export class ActorsRepository {
  async findById(db: AppDatabase, actorId: string): Promise<ActorWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(actors.id, actorId), isNull(actors.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetId(db: AppDatabase, assetId: string): Promise<ActorWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(actors.assetId, assetId), isNull(actors.deletedAt)),
    );

    return row ?? null;
  }

  /** Actor ids by asset id; assets without an active actor are missing from the result. */
  async findIdsByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ id: actors.id, assetId: actors.assetId })
      .from(actors)
      .where(and(inArray(actors.assetId, [...assetIds]), isNull(actors.deletedAt)));

    return new Map(rows.map((row) => [row.assetId, row.id]));
  }

  /** Sorted by name, then id. */
  async listPage(db: AppDatabase, filter: ActorListFilter): Promise<ActorPage> {
    if (filter.assetIds?.length === 0) {
      return { items: [], hasMore: false };
    }

    const search = filter.search ? `%${escapeLike(filter.search)}%` : null;
    const rows = await this.selectWithAsset(db)
      .where(
        and(
          isNull(actors.deletedAt),
          filter.where,
          filter.category ? eq(actors.category, filter.category) : undefined,
          filter.creatureType ? eq(actors.creatureType, filter.creatureType) : undefined,
          filter.size ? eq(actors.size, filter.size) : undefined,
          filter.assetIds ? inArray(actors.assetId, [...filter.assetIds]) : undefined,
          search ? or(ilike(assets.title, search), ilike(actors.displayName, search)) : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(assets.title), asc(actors.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ actor: actors, asset: assets })
      .from(actors)
      .innerJoin(assets, and(eq(assets.id, actors.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);

    return or(gt(assets.title, value), and(eq(assets.title, value), gt(actors.id, id)));
  }
}
