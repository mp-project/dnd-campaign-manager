import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import type { AppDatabase } from "#core/db/pool";
import type { TrackedRow, TrackedTable } from "#core/history/types";
import {
  entityChangeEvents,
  entityChangeFields,
  entityHistoryHorizons,
  historyIdempotencyKeys,
} from "#src/modules/history/domain/entities/HistoryTable";

export type ChangeEventRow = typeof entityChangeEvents.$inferSelect;
export type ChangeFieldRow = typeof entityChangeFields.$inferSelect;
export type ChangeEventInsert = typeof entityChangeEvents.$inferInsert;
export type ChangeFieldInsert = Omit<
  typeof entityChangeFields.$inferInsert,
  "eventId" | "entityType" | "entityId" | "entityVersion"
>;

export type EntityRef = { entityType: string; entityId: string };

export type FieldValueAt = { known: true; value: unknown } | { known: false };

/** Keep this many entries beyond the limit before deleting, so not every write has to delete. */
export const TRIM_BUFFER = 20;

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export class HistoryRepository {
  /** Only finds rows that still exist; the history of deleted rows is not available. */
  async findRow(db: AppDatabase, table: TrackedTable, id: string): Promise<TrackedRow | null> {
    const rows = await db
      .select()
      .from(table as never)
      .where(and(eq(table.id as never, id), isNull(table.deletedAt as never)));

    return (rows[0] as TrackedRow | undefined) ?? null;
  }

  async lockRow(db: AppDatabase, table: TrackedTable, id: string): Promise<TrackedRow | null> {
    const rows = await db
      .select()
      .from(table as never)
      .where(eq(table.id as never, id))
      .for("update");

    return (rows[0] as TrackedRow | undefined) ?? null;
  }

  async insertRow(
    db: AppDatabase,
    table: TrackedTable,
    values: Record<string, unknown>,
  ): Promise<TrackedRow> {
    const rows = (await db
      .insert(table as never)
      .values(values as never)
      .returning()) as unknown as TrackedRow[];

    return rows[0] as TrackedRow;
  }

  async updateRow(
    db: AppDatabase,
    table: TrackedTable,
    id: string,
    values: Record<string, unknown>,
  ): Promise<TrackedRow> {
    const rows = (await db
      .update(table as never)
      .set(values as never)
      .where(eq(table.id as never, id))
      .returning()) as unknown as TrackedRow[];

    return rows[0] as TrackedRow;
  }

  columnsOf(table: TrackedTable): string[] {
    return Object.keys(getTableColumns(table));
  }

  async createEvent(
    db: AppDatabase,
    event: ChangeEventInsert,
    fields: readonly ChangeFieldInsert[],
  ): Promise<ChangeEventRow> {
    const [created] = await db.insert(entityChangeEvents).values(event).returning();
    const row = created as ChangeEventRow;

    if (fields.length > 0) {
      await db.insert(entityChangeFields).values(
        fields.map((item) => ({
          ...item,
          eventId: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          entityVersion: row.entityVersion,
        })),
      );
    }

    return row;
  }

  async hasEvents(db: AppDatabase, ref: EntityRef): Promise<boolean> {
    const rows = await db
      .select({ id: entityChangeEvents.id })
      .from(entityChangeEvents)
      .where(
        and(
          eq(entityChangeEvents.entityType, ref.entityType),
          eq(entityChangeEvents.entityId, ref.entityId),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  async findEvent(db: AppDatabase, eventId: string): Promise<ChangeEventRow | null> {
    const [row] = await db
      .select()
      .from(entityChangeEvents)
      .where(eq(entityChangeEvents.id, eventId));

    return row ?? null;
  }

  async listEventsOfAction(db: AppDatabase, actionId: string): Promise<ChangeEventRow[]> {
    return db
      .select()
      .from(entityChangeEvents)
      .where(eq(entityChangeEvents.actionId, actionId))
      .orderBy(
        entityChangeEvents.entityType,
        entityChangeEvents.entityId,
        desc(entityChangeEvents.entityVersion),
      );
  }

  async listFieldsOfEvent(db: AppDatabase, eventId: string): Promise<ChangeFieldRow[]> {
    return db.select().from(entityChangeFields).where(eq(entityChangeFields.eventId, eventId));
  }

  /** Fields of an event that were already undone. */
  async listRevertedFields(db: AppDatabase, eventId: string): Promise<string[]> {
    const rows = await db
      .select({ field: entityChangeFields.field })
      .from(entityChangeFields)
      .innerJoin(entityChangeEvents, eq(entityChangeFields.eventId, entityChangeEvents.id))
      .where(eq(entityChangeEvents.revertsEventId, eventId));

    return rows.map((row) => row.field);
  }

  async findHorizon(db: AppDatabase, ref: EntityRef, field: string): Promise<number | null> {
    const [row] = await db
      .select({ version: entityHistoryHorizons.trimmedThroughVersion })
      .from(entityHistoryHorizons)
      .where(
        and(
          eq(entityHistoryHorizons.entityType, ref.entityType),
          eq(entityHistoryHorizons.entityId, ref.entityId),
          eq(entityHistoryHorizons.field, field),
        ),
      );

    return row?.version ?? null;
  }

  /** Newest change of a field after a version, joined with who made it. */
  async findLatestChangeAfter(db: AppDatabase, ref: EntityRef, field: string, version: number) {
    const [row] = await db
      .select({
        version: entityChangeFields.entityVersion,
        actorId: entityChangeEvents.actorId,
        changedAt: entityChangeFields.lastChangedAt,
      })
      .from(entityChangeFields)
      .innerJoin(entityChangeEvents, eq(entityChangeFields.eventId, entityChangeEvents.id))
      .where(
        and(
          eq(entityChangeFields.entityType, ref.entityType),
          eq(entityChangeFields.entityId, ref.entityId),
          eq(entityChangeFields.field, field),
          gt(entityChangeFields.entityVersion, version),
        ),
      )
      .orderBy(desc(entityChangeFields.entityVersion))
      .limit(1);

    return row ?? null;
  }

  /**
   * Value of a field at a version: the newest entry up to it. Unknown when trimmed entries could
   * lie between that entry and the version.
   */
  async findValueAt(
    db: AppDatabase,
    ref: EntityRef,
    field: string,
    version: number,
  ): Promise<FieldValueAt> {
    const [row] = await db
      .select({
        version: entityChangeFields.entityVersion,
        value: entityChangeFields.newValue,
      })
      .from(entityChangeFields)
      .where(
        and(
          eq(entityChangeFields.entityType, ref.entityType),
          eq(entityChangeFields.entityId, ref.entityId),
          eq(entityChangeFields.field, field),
          lte(entityChangeFields.entityVersion, version),
        ),
      )
      .orderBy(desc(entityChangeFields.entityVersion))
      .limit(1);

    if (!row) {
      return { known: false };
    }

    const horizon = await this.findHorizon(db, ref, field);

    if (row.version === version || horizon === null || row.version > horizon) {
      return { known: true, value: row.value };
    }

    return { known: false };
  }

  async listFieldChanges(
    db: AppDatabase,
    params: EntityRef & {
      field?: string;
      limit: number;
      before?: number;
      includeChildren?: boolean;
    },
  ) {
    const self = and(
      eq(entityChangeEvents.entityType, params.entityType),
      eq(entityChangeEvents.entityId, params.entityId),
    );
    const scope = params.includeChildren
      ? or(
          self,
          and(
            eq(entityChangeEvents.rootType, params.entityType),
            eq(entityChangeEvents.rootId, params.entityId),
          ),
        )
      : self;

    return db
      .select({ event: entityChangeEvents, change: entityChangeFields })
      .from(entityChangeFields)
      .innerJoin(entityChangeEvents, eq(entityChangeFields.eventId, entityChangeEvents.id))
      .where(
        and(
          scope,
          params.field ? eq(entityChangeFields.field, params.field) : undefined,
          params.before !== undefined ? lt(entityChangeEvents.seq, params.before) : undefined,
        ),
      )
      .orderBy(desc(entityChangeEvents.seq), entityChangeFields.field)
      .limit(params.limit);
  }

  /**
   * Removes the oldest entries of a field once it holds `limit + TRIM_BUFFER` entries. The first
   * version is never removed.
   *
   * @returns True when entries were removed.
   */
  async deleteOldFieldChanges(
    db: AppDatabase,
    ref: EntityRef,
    field: string,
    limit: number,
  ): Promise<boolean> {
    const fieldScope = and(
      eq(entityChangeFields.entityType, ref.entityType),
      eq(entityChangeFields.entityId, ref.entityId),
      eq(entityChangeFields.field, field),
      eq(entityChangeFields.isBaseline, false),
    );

    const [overflow] = await db
      .select({ version: entityChangeFields.entityVersion })
      .from(entityChangeFields)
      .where(fieldScope)
      .orderBy(desc(entityChangeFields.entityVersion))
      .limit(1)
      .offset(limit + TRIM_BUFFER - 1);

    if (!overflow) {
      return false;
    }

    const [cutoff] = await db
      .select({ version: entityChangeFields.entityVersion })
      .from(entityChangeFields)
      .where(fieldScope)
      .orderBy(desc(entityChangeFields.entityVersion))
      .limit(1)
      .offset(limit);

    const cutoffVersion = (cutoff ?? overflow).version;

    const removed = await db
      .delete(entityChangeFields)
      .where(and(fieldScope, lte(entityChangeFields.entityVersion, cutoffVersion)))
      .returning({ eventId: entityChangeFields.eventId });

    await db
      .insert(entityHistoryHorizons)
      .values({ ...ref, field, trimmedThroughVersion: cutoffVersion })
      .onConflictDoUpdate({
        target: [
          entityHistoryHorizons.entityType,
          entityHistoryHorizons.entityId,
          entityHistoryHorizons.field,
        ],
        set: {
          trimmedThroughVersion: sql`greatest(${entityHistoryHorizons.trimmedThroughVersion}, ${cutoffVersion})`,
        },
      });

    await db.delete(entityChangeEvents).where(
      and(
        inArray(
          entityChangeEvents.id,
          removed.map((item) => item.eventId),
        ),
        notExists(
          db
            .select({ eventId: entityChangeFields.eventId })
            .from(entityChangeFields)
            .where(eq(entityChangeFields.eventId, entityChangeEvents.id)),
        ),
      ),
    );

    return true;
  }

  /**
   * Claims an idempotency key. A parallel request with the same key waits here until the first
   * one commits or rolls back.
   *
   * @returns The earlier action id when the key was already used, otherwise null.
   */
  async claimIdempotencyKey(
    db: AppDatabase,
    params: { actorId: string; key: string; actionId: string },
  ): Promise<string | null> {
    await db
      .delete(historyIdempotencyKeys)
      .where(
        and(
          eq(historyIdempotencyKeys.actorId, params.actorId),
          lt(historyIdempotencyKeys.expiresAt, new Date()),
        ),
      );

    const [claimed] = await db
      .insert(historyIdempotencyKeys)
      .values({ ...params, expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS) })
      .onConflictDoNothing()
      .returning({ actionId: historyIdempotencyKeys.actionId });

    if (claimed) {
      return null;
    }

    const [existing] = await db
      .select({ actionId: historyIdempotencyKeys.actionId })
      .from(historyIdempotencyKeys)
      .where(
        and(
          eq(historyIdempotencyKeys.actorId, params.actorId),
          eq(historyIdempotencyKeys.key, params.key),
        ),
      );

    return existing?.actionId ?? null;
  }
}
