import { and, asc, eq, gt, inArray, isNull, or, type SQL } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { decodePaginationCursor } from "#core/http/listResponse";
import { assetLinks } from "#src/modules/asset-links/domain/entities/AssetLinksTable";
import type { AssetLinkDirection } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";

export type AssetLinkRow = typeof assetLinks.$inferSelect;

export type AssetLinkListFilter = {
  campaignId: string;
  assetId: string;
  direction?: AssetLinkDirection | undefined;
  relationType?: string | undefined;
};

export type AssetLinkPage = {
  items: AssetLinkRow[];
  hasMore: boolean;
};

function readCursor(cursor: string): { sortOrder: number; id: string } {
  try {
    const { sortValue, id } = decodePaginationCursor(cursor);

    if (typeof sortValue === "number") {
      return { sortOrder: sortValue, id };
    }
  } catch {
    // Reported below, like a cursor with the wrong content.
  }

  throw new ValidationError("Invalid pagination cursor");
}

/** Link rows only change through the history (`scope.create`, `scope.change`, `scope.softDelete`). */
export class AssetLinksRepository {
  async findById(db: AppDatabase, linkId: string): Promise<AssetLinkRow | null> {
    const [row] = await db
      .select()
      .from(assetLinks)
      .where(and(eq(assetLinks.id, linkId), isNull(assetLinks.deletedAt)))
      .limit(1);

    return row ?? null;
  }

  async listPage(
    db: AppDatabase,
    filter: AssetLinkListFilter & { limit: number; cursor?: string | undefined },
  ): Promise<AssetLinkPage> {
    const rows = await db
      .select()
      .from(assetLinks)
      .where(and(...this.buildWhere(filter), this.buildCursorWhere(filter.cursor)))
      .orderBy(asc(assetLinks.sortOrder), asc(assetLinks.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  async listForAsset(db: AppDatabase, filter: AssetLinkListFilter): Promise<AssetLinkRow[]> {
    return db
      .select()
      .from(assetLinks)
      .where(and(...this.buildWhere(filter)))
      .orderBy(asc(assetLinks.sortOrder), asc(assetLinks.id));
  }

  /** Looks across campaigns, because a global asset can be the target in any of them. */
  async listIncomingOfTypes(
    db: AppDatabase,
    targetAssetId: string,
    relationTypes: readonly string[],
  ): Promise<AssetLinkRow[]> {
    if (relationTypes.length === 0) {
      return [];
    }

    return db
      .select()
      .from(assetLinks)
      .where(
        and(
          eq(assetLinks.targetAssetId, targetAssetId),
          inArray(assetLinks.relationType, [...relationTypes]),
          isNull(assetLinks.deletedAt),
        ),
      )
      .orderBy(asc(assetLinks.id));
  }

  private buildWhere(filter: AssetLinkListFilter): (SQL | undefined)[] {
    const outgoing = eq(assetLinks.sourceAssetId, filter.assetId);
    const incoming = eq(assetLinks.targetAssetId, filter.assetId);

    return [
      eq(assetLinks.campaignId, filter.campaignId),
      isNull(assetLinks.deletedAt),
      filter.direction === "outgoing"
        ? outgoing
        : filter.direction === "incoming"
          ? incoming
          : or(outgoing, incoming),
      filter.relationType ? eq(assetLinks.relationType, filter.relationType) : undefined,
    ];
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { sortOrder, id } = readCursor(cursor);

    return or(
      gt(assetLinks.sortOrder, sortOrder),
      and(eq(assetLinks.sortOrder, sortOrder), gt(assetLinks.id, id)),
    );
  }
}
