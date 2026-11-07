import { and, asc, eq, gt, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import { escapeLike } from "#core/db/escapeLike";

import type { AppDatabase } from "#core/db/pool";
import { decodeNumberCursor } from "#core/http/listResponse";
import { assets, type AssetRow, type AssetStatus } from "#src/modules/assets/index";
import { notes } from "#src/modules/notes/domain/entities/NotesTable";
import type { NoteType } from "#src/modules/notes/domain/dto/BaseNoteDto";

export type NoteRow = typeof notes.$inferSelect;

/** A note with its asset, which holds name, summary and status, and the ids of its tags. */
export type NoteRecord = { note: NoteRow; asset: AssetRow; tagIds: readonly string[] };

export type NoteWithAsset = Omit<NoteRecord, "tagIds">;

export type NotePage = {
  items: NoteWithAsset[];
  hasMore: boolean;
};

export type NoteListFilter = {
  campaignId: string;
  statuses: readonly AssetStatus[];
  limit: number;
  cursor?: string | undefined;
  noteType?: NoteType | undefined;
  search?: string | undefined;
  /** Only notes of these assets, e.g. those shared with a player or carrying a tag. */
  assetIds?: readonly string[] | undefined;
};

/** Note rows only change through the history; reads join the asset they belong to. */
export class NotesRepository {
  async findById(db: AppDatabase, noteId: string): Promise<NoteWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(notes.id, noteId), isNull(notes.deletedAt)),
    );

    return row ?? null;
  }

  async findByAssetId(db: AppDatabase, assetId: string): Promise<NoteWithAsset | null> {
    const [row] = await this.selectWithAsset(db).where(
      and(eq(notes.assetId, assetId), isNull(notes.deletedAt)),
    );

    return row ?? null;
  }

  /** Note ids by asset id; assets without an active note are missing from the result. */
  async findIdsByAssetIds(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, string>> {
    if (assetIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({ id: notes.id, assetId: notes.assetId })
      .from(notes)
      .where(and(inArray(notes.assetId, [...assetIds]), isNull(notes.deletedAt)));

    return new Map(rows.map((row) => [row.assetId, row.id]));
  }

  async listPage(db: AppDatabase, filter: NoteListFilter): Promise<NotePage> {
    if (filter.assetIds?.length === 0 || filter.statuses.length === 0) {
      return { items: [], hasMore: false };
    }

    const rows = await this.selectWithAsset(db)
      .where(
        and(
          eq(notes.campaignId, filter.campaignId),
          isNull(notes.deletedAt),
          inArray(assets.status, [...filter.statuses]),
          filter.noteType ? eq(notes.noteType, filter.noteType) : undefined,
          filter.assetIds ? inArray(notes.assetId, [...filter.assetIds]) : undefined,
          filter.search ? ilike(assets.title, `%${escapeLike(filter.search)}%`) : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(asc(notes.sortOrder), asc(notes.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  private selectWithAsset(db: AppDatabase) {
    return db
      .select({ note: notes, asset: assets })
      .from(notes)
      .innerJoin(assets, and(eq(assets.id, notes.assetId), isNull(assets.deletedAt)));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeNumberCursor(cursor);

    return or(gt(notes.sortOrder, value), and(eq(notes.sortOrder, value), gt(notes.id, id)));
  }
}
