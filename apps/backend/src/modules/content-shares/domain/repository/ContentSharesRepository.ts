import { and, desc, eq, gt, inArray, isNull, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import { ValidationError } from "#core/error/http/index";
import { decodeStringCursor } from "#core/http/listResponse";
import {
  contentShareRecipients,
  contentShares,
} from "#src/modules/content-shares/domain/entities/ContentSharesTable";

export type ContentShareRow = typeof contentShares.$inferSelect;

export type ReceivedShareRow = { share: ContentShareRow; revealedAt: Date };

/** Expired shares count as gone everywhere, even before they are deleted. */
const notExpired = or(isNull(contentShares.expiresAt), sql`${contentShares.expiresAt} > now()`) as SQL;

export class ContentSharesRepository {
  async deleteExpired(db: AppDatabase, campaignId: string): Promise<void> {
    await db
      .delete(contentShares)
      .where(and(eq(contentShares.campaignId, campaignId), lte(contentShares.expiresAt, sql`now()`)));
  }

  async findById(db: AppDatabase, shareId: string): Promise<ContentShareRow | null> {
    const [row] = await db
      .select()
      .from(contentShares)
      .where(and(eq(contentShares.id, shareId), notExpired))
      .limit(1);

    return row ?? null;
  }

  async create(
    db: AppDatabase,
    values: Pick<
      typeof contentShares.$inferInsert,
      "campaignId" | "assetId" | "audience" | "expiresAt" | "createdBy"
    >,
  ): Promise<ContentShareRow> {
    const [row] = await db.insert(contentShares).values(values).returning();

    return row!;
  }

  /** Null when the version does not match or the share is gone. */
  async update(
    db: AppDatabase,
    params: {
      shareId: string;
      expectedVersion: number;
      values: Partial<Pick<ContentShareRow, "audience" | "expiresAt" | "sharedAt">>;
      actorId: string;
    },
  ): Promise<ContentShareRow | null> {
    const [row] = await db
      .update(contentShares)
      .set({
        ...params.values,
        version: sql`${contentShares.version} + 1`,
        updatedAt: sql`now()`,
        updatedBy: params.actorId,
      })
      .where(
        and(
          eq(contentShares.id, params.shareId),
          eq(contentShares.version, params.expectedVersion),
          notExpired,
        ),
      )
      .returning();

    return row ?? null;
  }

  async delete(db: AppDatabase, shareId: string): Promise<boolean> {
    const rows = await db
      .delete(contentShares)
      .where(and(eq(contentShares.id, shareId), notExpired))
      .returning({ id: contentShares.id });

    return rows.length > 0;
  }

  async listRecipientIds(
    db: AppDatabase,
    shareIds: readonly string[],
  ): Promise<Map<string, string[]>> {
    if (shareIds.length === 0) {
      return new Map();
    }

    const rows = await db
      .select({
        shareId: contentShareRecipients.contentShareId,
        memberId: contentShareRecipients.campaignMembershipId,
      })
      .from(contentShareRecipients)
      .where(inArray(contentShareRecipients.contentShareId, [...shareIds]))
      .orderBy(contentShareRecipients.createdAt, contentShareRecipients.id);
    const result = new Map<string, string[]>();

    for (const row of rows) {
      result.set(row.shareId, [...(result.get(row.shareId) ?? []), row.memberId]);
    }

    return result;
  }

  /** Keeps recipients that stay, so they are not shown the content as new again. */
  async replaceRecipients(
    db: AppDatabase,
    params: { shareId: string; memberIds: readonly string[]; actorId: string },
  ): Promise<void> {
    await db
      .delete(contentShareRecipients)
      .where(
        and(
          eq(contentShareRecipients.contentShareId, params.shareId),
          params.memberIds.length > 0
            ? notInArray(contentShareRecipients.campaignMembershipId, [...params.memberIds])
            : undefined,
        ),
      );

    if (params.memberIds.length > 0) {
      await db
        .insert(contentShareRecipients)
        .values(
          params.memberIds.map((memberId) => ({
            contentShareId: params.shareId,
            campaignMembershipId: memberId,
            createdBy: params.actorId,
          })),
        )
        .onConflictDoNothing();
    }
  }

  async listPage(
    db: AppDatabase,
    filter: {
      campaignId: string;
      limit: number;
      cursor?: string | undefined;
      since?: Date | undefined;
    },
  ): Promise<{ items: ContentShareRow[]; hasMore: boolean }> {
    const rows = await db
      .select()
      .from(contentShares)
      .where(
        and(
          eq(contentShares.campaignId, filter.campaignId),
          notExpired,
          filter.since ? gt(contentShares.sharedAt, filter.since) : undefined,
          this.buildCursorWhere(filter.cursor),
        ),
      )
      .orderBy(desc(contentShares.sharedAt), desc(contentShares.id))
      .limit(filter.limit + 1);

    return { items: rows.slice(0, filter.limit), hasMore: rows.length > filter.limit };
  }

  /** Shares that reach a membership, with the time it was revealed to it. */
  async listReceived(
    db: AppDatabase,
    filter: { campaignId: string; memberId: string },
  ): Promise<ReceivedShareRow[]> {
    const rows = await db
      .select({ share: contentShares, recipientAt: contentShareRecipients.createdAt })
      .from(contentShares)
      .leftJoin(
        contentShareRecipients,
        and(
          eq(contentShareRecipients.contentShareId, contentShares.id),
          eq(contentShareRecipients.campaignMembershipId, filter.memberId),
        ),
      )
      .where(
        and(
          eq(contentShares.campaignId, filter.campaignId),
          notExpired,
          or(
            eq(contentShares.audience, "ALL_PLAYERS"),
            sql`${contentShareRecipients.id} is not null`,
          ),
        ),
      );

    return rows.map((row) => ({
      share: row.share,
      revealedAt:
        row.share.audience === "ALL_PLAYERS" || !row.recipientAt ? row.share.sharedAt : row.recipientAt,
    }));
  }

  async findByAsset(db: AppDatabase, assetId: string): Promise<ContentShareRow[]> {
    return db
      .select()
      .from(contentShares)
      .where(and(eq(contentShares.assetId, assetId), notExpired));
  }

  private buildCursorWhere(cursor: string | undefined): SQL | undefined {
    if (!cursor) {
      return undefined;
    }

    const { value, id } = decodeStringCursor(cursor);
    const at = new Date(value);

    if (Number.isNaN(at.getTime())) {
      throw new ValidationError("Invalid pagination cursor");
    }

    return or(
      lt(contentShares.sharedAt, at),
      and(eq(contentShares.sharedAt, at), lt(contentShares.id, id)),
    );
  }
}
