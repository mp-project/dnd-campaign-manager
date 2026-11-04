import { randomUUID } from "node:crypto";

import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { authorized, isAuthorization } from "#core/history/authorization";
import { uuidDto } from "#core/http/dto";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  VersionConflictError,
} from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  VALUE_KINDS,
  type ActionMeta,
  type ActionScope,
  type EntityVersionView,
  type FieldChangeItem,
  type FieldChangePage,
  type GetEntityVersionParams,
  type HistoryEvent,
  type HistoryEventHandler,
  type HistoryPort,
  type ListFieldChangesParams,
  type TrackedEntity,
  type TrackedRow,
  type TrackedTable,
} from "#core/history/types";
import { isSysAdminRole } from "#core/permissions/roles";
import type {
  ChangeEventRow,
  ChangeFieldRow,
  HistoryRepository,
} from "#src/modules/history/domain/repository/HistoryRepository";
import {
  HistoryActionScope,
  allFieldRules,
  domainColumnsOf,
  fieldRuleOf,
  fromStoredValue,
} from "#src/modules/history/service/HistoryActionScope";
import { sameValue, toStoredValue } from "#src/modules/history/service/HistoryMerge";

type Logger = { error(payload: unknown, message: string): void };

const NOT_FOUND_MESSAGE = "Resource not found";

export class HistoryService implements HistoryPort {
  private readonly entities = new Map<string, TrackedEntity>();
  private readonly subscribers: { pattern: string; handler: HistoryEventHandler }[] = [];

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: HistoryRepository,
    private readonly logger: Logger,
  ) {}

  register<T extends TrackedTable>(entity: TrackedEntity<T>): void {
    const erased = entity as unknown as TrackedEntity;

    if (this.entities.has(erased.type)) {
      throw new Error(`History entity '${erased.type}' is already registered`);
    }

    const declared = new Set(Object.keys(erased.fields));
    const columns = domainColumnsOf(this.repository.columnsOf(erased.table));
    const missing = columns.filter((column) => !declared.has(column));
    const unknown = [...declared].filter((field) => !columns.includes(field));

    if (missing.length > 0 || unknown.length > 0) {
      throw new Error(
        `History entity '${erased.type}' has unclassified columns [${missing.join(", ")}] ` +
          `or unknown fields [${unknown.join(", ")}]`,
      );
    }

    const allColumns = this.repository.columnsOf(erased.table);
    const clashing = Object.keys(erased.lists ?? {}).filter((field) => allColumns.includes(field));

    if (clashing.length > 0) {
      throw new Error(
        `History entity '${erased.type}' has lists named like columns [${clashing.join(", ")}]`,
      );
    }

    this.entities.set(erased.type, erased);
  }

  subscribe(pattern: string, handler: HistoryEventHandler): void {
    this.subscribers.push({ pattern, handler });
  }

  async runAction<R>(
    meta: ActionMeta<R>,
    work: (scope: ActionScope) => Promise<R>,
  ): Promise<R> {
    const { result, events } = await this.transactionManager.inTransaction((tx) =>
      this.runActionInTransaction(tx, meta, work),
    );

    await this.publish(events);

    return result;
  }

  async runActionInTransaction<R>(
    tx: AppDatabase,
    meta: ActionMeta<R>,
    work: (scope: ActionScope) => Promise<R>,
  ): Promise<{ result: R; events: HistoryEvent[] }> {
    return this.runInScope(tx, meta, (scope) => work(scope));
  }

  private async runInScope<R>(
    tx: AppDatabase,
    meta: ActionMeta<R>,
    work: (scope: HistoryActionScope) => Promise<R>,
  ): Promise<{ result: R; events: HistoryEvent[] }> {
    const { actorId } = meta.context;

    if (actorId !== null && !uuidDto.safeParse(actorId).success) {
      throw new UnauthenticatedError("Valid actor identity required");
    }

    if (!isAuthorization(await meta.authorize(tx))) {
      throw new Error(`Action '${meta.action}' returned no authorization`);
    }

    const actionId = randomUUID();

    if (meta.idempotency && actorId) {
      const earlier = await this.repository.claimIdempotencyKey(tx, {
        actorId,
        key: meta.idempotency.key,
        actionId,
      });

      if (earlier) {
        return { result: await meta.idempotency.onReplay(earlier), events: [] };
      }
    }

    const scope = new HistoryActionScope(tx, this.repository, actionId, meta);
    const result = await work(scope);

    return { result, events: scope.events };
  }

  /** Runs handlers after the commit. A failing handler is logged and cannot undo the change. */
  async publish(events: readonly HistoryEvent[]): Promise<void> {
    for (const event of events) {
      for (const { pattern, handler } of this.subscribers) {
        if (pattern !== "*" && pattern !== event.action) {
          continue;
        }

        try {
          await handler(event);
        } catch (error) {
          this.logger.error({ error, action: event.action }, "History event handler failed");
        }
      }
    }
  }

  /** Unknown types, deleted rows and rows the actor may not see give the same answer. */
  private async loadReadable(
    context: RequestContext,
    entityType: string,
    entityId: string,
  ): Promise<{ entity: TrackedEntity; row: TrackedRow }> {
    const entity = this.entities.get(entityType);

    if (!entity) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    const row = await this.repository.findRow(this.db, entity.table, entityId);

    if (!row || !(await this.canRead(context, entity, row, this.db))) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    return { entity, row };
  }

  private async canRead(
    context: RequestContext,
    entity: TrackedEntity,
    row: TrackedRow,
    db: AppDatabase,
  ): Promise<boolean> {
    return isSysAdminRole(context.systemRole) || (await entity.access.read(context, row, db));
  }

  private async canReadField(
    context: RequestContext,
    entity: TrackedEntity,
    row: TrackedRow,
    field: string,
  ): Promise<boolean> {
    return (
      isSysAdminRole(context.systemRole) ||
      ((await entity.access.readField?.(context, row, field, this.db)) ?? true)
    );
  }

  async listFieldChanges(
    context: RequestContext,
    params: ListFieldChangesParams,
  ): Promise<FieldChangePage> {
    const { entity } = await this.loadReadable(context, params.entityType, params.entityId);

    if (params.field && !fieldRuleOf(entity, params.field)) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    const rows = await this.repository.listFieldChanges(this.db, {
      entityType: params.entityType,
      entityId: params.entityId,
      limit: params.limit + 1,
      ...(params.field ? { field: params.field } : {}),
      ...(params.before !== undefined ? { before: params.before } : {}),
      ...(params.includeChildren ? { includeChildren: true } : {}),
    });
    const page = rows.slice(0, params.limit);
    const data: FieldChangeItem[] = [];
    const visibleRows = new Map<string, { entity: TrackedEntity; row: TrackedRow } | null>();

    for (const { event, change } of page) {
      const key = `${event.entityType}:${event.entityId}`;
      let owner = visibleRows.get(key);

      if (owner === undefined) {
        owner = await this.loadVisibleOwner(context, event);
        visibleRows.set(key, owner);
      }

      if (
        owner &&
        (await this.canReadField(context, owner.entity, owner.row, change.field))
      ) {
        data.push(toFieldChangeItem(event, change));
      }
    }

    return {
      data,
      nextBefore:
        rows.length > params.limit ? (page[page.length - 1]?.event.seq ?? null) : null,
    };
  }

  /** Rights are checked per entity, also for children in a combined view. */
  private async loadVisibleOwner(
    context: RequestContext,
    event: ChangeEventRow,
  ): Promise<{ entity: TrackedEntity; row: TrackedRow } | null> {
    const entity = this.entities.get(event.entityType);

    if (!entity) {
      return null;
    }

    const row = await this.repository.findRow(this.db, entity.table, event.entityId);

    return row && (await this.canRead(context, entity, row, this.db)) ? { entity, row } : null;
  }

  async getVersion(
    context: RequestContext,
    params: GetEntityVersionParams,
  ): Promise<EntityVersionView> {
    const { entity, row } = await this.loadReadable(context, params.entityType, params.entityId);

    if (params.version < 1 || params.version > row.version) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    const values: Record<string, unknown> = {};
    const incomplete: string[] = [];

    for (const [field, rule] of allFieldRules(entity)) {
      if (
        !VALUE_KINDS.includes(rule.kind) ||
        !(await this.canReadField(context, entity, row, field))
      ) {
        continue;
      }

      const state = await this.repository.findValueAt(
        this.db,
        { entityType: params.entityType, entityId: params.entityId },
        field,
        params.version,
      );

      if (state.known) {
        values[field] = state.value;
      } else {
        incomplete.push(field);
      }
    }

    return {
      entityType: params.entityType,
      entityId: params.entityId,
      version: params.version,
      values,
      incomplete,
    };
  }

  /**
   * Undoes one event as a new action. `fields` limits it to some fields; it can only be limited
   * further, never widened.
   */
  async revertEvent(
    context: RequestContext,
    eventId: string,
    options: { fields?: readonly string[]; reason?: string | null },
  ): Promise<{ actionId: string }> {
    const event = await this.repository.findEvent(this.db, eventId);
    const entity = event ? this.entities.get(event.entityType) : undefined;

    if (!event || !entity) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    return this.runRevert(context, options.reason ?? null, async (scope) => {
      await this.revertOneEvent(context, scope, entity, event, options.fields);
    });
  }

  /** Undoes a whole action; a single missing right rejects all of it. */
  async revertAction(
    context: RequestContext,
    actionId: string,
    options: { reason?: string | null },
  ): Promise<{ actionId: string }> {
    const events = await this.repository.listEventsOfAction(this.db, actionId);

    if (events.length === 0) {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }

    return this.runRevert(context, options.reason ?? null, async (scope) => {
      // Sorted by the query, so parallel actions lock rows in the same order.
      for (const event of events) {
        const entity = this.entities.get(event.entityType);

        if (!entity) {
          throw new NotFoundError(NOT_FOUND_MESSAGE);
        }

        await this.revertOneEvent(context, scope, entity, event, undefined);
      }
    });
  }

  private async runRevert(
    context: RequestContext,
    reason: string | null,
    work: (scope: HistoryActionScope) => Promise<void>,
  ): Promise<{ actionId: string }> {
    const { result, events } = await withOldValueConflicts(() =>
      this.transactionManager.inTransaction((tx) =>
        this.runInScope(
          tx,
          { action: "history.revert", context, reason, authorize: checkedPerRow },
          async (scope) => {
            await work(scope);

            return { actionId: scope.actionId };
          },
        ),
      ),
    );

    await this.publish(events);

    return result;
  }

  private async revertOneEvent(
    context: RequestContext,
    scope: HistoryActionScope,
    entity: TrackedEntity,
    event: ChangeEventRow,
    onlyFields: readonly string[] | undefined,
  ): Promise<void> {
    const { tx } = scope;

    await scope.changeInternal(
      entity,
      event.entityId,
      async (current) => {
        const row = current as TrackedRow;

        if (!(await this.canRead(context, entity, row, tx))) {
          throw new NotFoundError(NOT_FOUND_MESSAGE);
        }

        const stored = await this.repository.listFieldsOfEvent(tx, event.id);
        const fields = selectFields(stored, onlyFields);

        await this.assertRevertAllowed(context, entity, row, event, fields, tx);

        return this.buildRevert(entity, row, event, fields, tx);
      },
      { revertsEventId: event.id },
    );
  }

  private async assertRevertAllowed(
    context: RequestContext,
    entity: TrackedEntity,
    row: TrackedRow,
    event: ChangeEventRow,
    fields: readonly ChangeFieldRow[],
    tx: AppDatabase,
  ): Promise<void> {
    const names = fields.map((item) => item.field);
    const admin = isSysAdminRole(context.systemRole);
    const allowed =
      admin ||
      ((await entity.access.revert?.(
        context,
        row,
        { actorId: event.actorId, action: event.action, fields: names },
        tx,
      )) ??
        false);

    if (!allowed) {
      throw new ForbiddenError("Insufficient permissions");
    }

    if (!event.revertible) {
      throw new ConflictError("This action cannot be undone");
    }

    const blocked = fields
      .filter((item) => item.isBaseline || !isRevertibleField(entity, item.field))
      .map((item) => item.field);

    if (blocked.length > 0) {
      throw new ConflictError("These changes cannot be undone", { fields: blocked });
    }

    const undone = await this.repository.listRevertedFields(tx, event.id);
    const repeated = names.filter((name) => undone.includes(name));

    if (repeated.length > 0) {
      throw new ConflictError("These changes were already undone", { fields: repeated });
    }
  }

  private async buildRevert(
    entity: TrackedEntity,
    row: TrackedRow,
    event: ChangeEventRow,
    fields: readonly ChangeFieldRow[],
    tx: AppDatabase,
  ) {
    const set: Record<string, unknown> = {};
    const inc: Record<string, number> = {};
    const ref = { entityType: event.entityType, entityId: event.entityId };

    for (const item of fields) {
      if (item.kind === "counter" && item.delta !== null) {
        inc[item.field] = -item.delta;
        continue;
      }

      if (item.kind !== "position" && !sameValue(row[item.field], item.newValue)) {
        throw new VersionConflictError("The content was changed by someone else", {
          currentVersion: row.version,
          conflicts: [{ field: item.field }],
        });
      }

      const previous = await this.repository.findValueAt(
        tx,
        ref,
        item.field,
        item.entityVersion - 1,
      );

      if (!previous.known) {
        throw new ConflictError("The previous value is no longer available", {
          fields: [item.field],
        });
      }

      set[item.field] = fromStoredValue(entity, item.field, previous.value);
    }

    assertBaseSchema(entity, set);

    return { set, inc };
  }

  /** Sets all revertible fields to their value at a version, as a new action. */
  async restoreVersion(
    context: RequestContext,
    params: GetEntityVersionParams & { reason?: string | null },
  ): Promise<{ actionId: string }> {
    const { entity } = await this.loadReadable(context, params.entityType, params.entityId);

    const { result, events } = await withOldValueConflicts(() =>
      this.transactionManager.inTransaction((tx) =>
        this.runInScope(
          tx,
          {
            action: "history.restore",
            context,
            reason: params.reason ?? null,
            authorize: checkedPerRow,
          },
          async (scope) => {
            await scope.changeInternal(
              entity,
              params.entityId,
              async (current) => {
                const row = current as TrackedRow;
                const allowed =
                  isSysAdminRole(context.systemRole) ||
                  ((await entity.access.restore?.(context, row, tx)) ?? false);

                if (!allowed) {
                  throw new ForbiddenError("Insufficient permissions");
                }

                if (params.version < 1 || params.version > row.version) {
                  throw new NotFoundError(NOT_FOUND_MESSAGE);
                }

                const set = await this.loadRestoreValues(entity, params, tx);

                assertBaseSchema(entity, set);

                return { set };
              },
              { restoredFromVersion: params.version },
            );

            return { actionId: scope.actionId };
          },
        ),
      ),
    );

    await this.publish(events);

    return result;
  }

  private async loadRestoreValues(
    entity: TrackedEntity,
    params: GetEntityVersionParams,
    tx: AppDatabase,
  ): Promise<Record<string, unknown>> {
    const set: Record<string, unknown> = {};
    const incomplete: string[] = [];

    for (const [field] of allFieldRules(entity)) {
      if (!isRevertibleField(entity, field)) {
        continue;
      }

      const state = await this.repository.findValueAt(
        tx,
        { entityType: params.entityType, entityId: params.entityId },
        field,
        params.version,
      );

      if (state.known) {
        set[field] = fromStoredValue(entity, field, state.value);
      } else {
        incomplete.push(field);
      }
    }

    if (incomplete.length > 0) {
      throw new ConflictError("This version is no longer complete", { fields: incomplete });
    }

    return set;
  }
}

/** Revert and restore check `access` on the locked row, because the rows are only known there. */
const checkedPerRow = async () => authorized();

const CONSTRAINT_VIOLATION_CODES: readonly unknown[] = ["23505", "23503", "23514"];

function isConstraintViolation(error: unknown): boolean {
  let current = error;

  while (typeof current === "object" && current !== null) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };

    if (CONSTRAINT_VIOLATION_CODES.includes(code)) {
      return true;
    }

    current = cause;
  }

  return false;
}

/** An old value can clash with today's data, such as a slug that is taken by now. */
async function withOldValueConflicts<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (isConstraintViolation(error)) {
      throw new ConflictError("The old value is no longer valid");
    }

    throw error;
  }
}

function selectFields(
  stored: readonly ChangeFieldRow[],
  onlyFields: readonly string[] | undefined,
): ChangeFieldRow[] {
  if (!onlyFields) {
    return [...stored];
  }

  const selected = stored.filter((item) => onlyFields.includes(item.field));

  if (selected.length !== onlyFields.length) {
    throw new NotFoundError(NOT_FOUND_MESSAGE);
  }

  return selected;
}

function isRevertibleField(entity: TrackedEntity, field: string): boolean {
  const rule = fieldRuleOf(entity, field);

  if (!rule || !VALUE_KINDS.includes(rule.kind)) {
    return false;
  }

  return !("revertible" in rule) || rule.revertible !== false;
}

/** Old values must still satisfy today's input rules before they are written back. */
function assertBaseSchema(entity: TrackedEntity, values: Record<string, unknown>): void {
  if (!entity.baseSchema) {
    return;
  }

  const known = entity.baseSchema.shape;
  const fields = Object.keys(values).filter((field) => field in known);

  if (fields.length === 0) {
    return;
  }

  const stored = Object.fromEntries(
    fields.map((field) => [field, toStoredValue(values[field])]),
  );
  const mask = Object.fromEntries(fields.map((field) => [field, true]));

  try {
    entity.baseSchema.pick(mask as never).parse(stored);
  } catch {
    throw new ConflictError("The old value is no longer valid");
  }
}

function toFieldChangeItem(event: ChangeEventRow, change: ChangeFieldRow): FieldChangeItem {
  return {
    seq: event.seq,
    eventId: event.id,
    actionId: event.actionId,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    version: event.entityVersion,
    field: change.field,
    kind: change.kind,
    value: change.newValue,
    delta: change.delta,
    redacted: change.kind === "account" || change.kind === "secret",
    isBaseline: change.isBaseline,
    actorId: event.actorId,
    reason: event.reason,
    revertsEventId: event.revertsEventId,
    restoredFromVersion: event.restoredFromVersion,
    createdAt: event.createdAt.toISOString(),
    lastChangedAt: change.lastChangedAt.toISOString(),
  };
}
