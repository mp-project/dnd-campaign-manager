import { getTableColumns } from "drizzle-orm";

import { toAuditActorId } from "#core/db/auditActor";
import type { AppDatabase } from "#core/db/pool";
import { NotFoundError, ValidationError, VersionConflictError } from "#core/error/http/index";
import {
  ACCOUNT_HISTORY_LIMIT,
  BASE_COLUMN_KEYS,
  DEFAULT_HISTORY_LIMIT,
  HISTORY_LIMITS,
  VALUE_KINDS,
  type ActionMeta,
  type ActionScope,
  type ChangeResult,
  type CounterFieldRule,
  type EntityChangeInput,
  type FieldRule,
  type HistoryEvent,
  type StoredFieldValue,
  type TouchedEntity,
  type TrackedEntity,
  type TrackedRow,
  type TrackedTable,
} from "#core/history/types";
import { isSysAdminRole } from "#core/permissions/roles";
import type {
  ChangeFieldInsert,
  EntityRef,
  HistoryRepository,
} from "#src/modules/history/domain/repository/HistoryRepository";
import {
  applyGroups,
  decideMerge,
  sameValue,
  toStoredValue,
  type MergeDecision,
} from "#src/modules/history/service/HistoryMerge";

/** Marks the soft-delete entry. It stays on record, but a deleted row stays deleted. */
export const LIFECYCLE_FIELD = "deletedAt";

const BASELINE_ACTION = "history.baseline";

/** Internal options of `change`, used by revert and restore. */
export type ChangeOptions = {
  revertsEventId?: string;
  restoredFromVersion?: number;
  lifecycle?: boolean;
};

export function fieldRuleOf(entity: TrackedEntity, field: string): FieldRule | undefined {
  return (entity.fields as Record<string, FieldRule>)[field] ?? entity.lists?.[field];
}

/** Rules of all fields of an entity, columns and lists. */
export function allFieldRules(entity: TrackedEntity): [string, FieldRule][] {
  return [...Object.entries(entity.fields), ...Object.entries(entity.lists ?? {})];
}

function normalizeList(values: unknown): string[] {
  return [...new Set(values as readonly string[])].sort();
}

function limitOf(entity: TrackedEntity, rule: FieldRule): number {
  if (rule.kind === "account") {
    return HISTORY_LIMITS[ACCOUNT_HISTORY_LIMIT];
  }

  const own = rule.kind === "ignore" ? undefined : rule.history;

  return HISTORY_LIMITS[own ?? entity.history?.limit ?? DEFAULT_HISTORY_LIMIT];
}

/** Turns stored JSON back into the column's type. */
export function fromStoredValue(entity: TrackedEntity, field: string, value: unknown): unknown {
  const column = getTableColumns(entity.table)[field];

  return column?.dataType === "date" && typeof value === "string" ? new Date(value) : value;
}

type PendingField = ChangeFieldInsert;

export class HistoryActionScope implements ActionScope {
  readonly events: HistoryEvent[] = [];
  /** Every row the action created or changed, for the verifiers at its end. */
  readonly touched: TouchedEntity[] = [];

  constructor(
    readonly tx: AppDatabase,
    private readonly repository: HistoryRepository,
    readonly actionId: string,
    private readonly meta: Pick<ActionMeta<unknown>, "action" | "context" | "reason" | "revertible">,
  ) {}

  private get actorId(): string | null {
    return this.meta.context.actorId;
  }

  async valueAt<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
    field: string,
    version: number,
  ): Promise<StoredFieldValue> {
    return this.repository.findValueAt(
      this.tx,
      { entityType: entity.type, entityId: id },
      field,
      version,
    );
  }

  async create<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    values: Record<string, unknown>,
  ): Promise<T["$inferSelect"]> {
    const erased = entity as unknown as TrackedEntity;
    const auditId = toAuditActorId(this.actorId);
    const columnValues = { ...values };
    const listValues: Record<string, string[]> = {};

    for (const field of Object.keys(erased.lists ?? {})) {
      listValues[field] = normalizeList(values[field] ?? []);
      delete columnValues[field];
    }

    const row = await this.repository.insertRow(this.tx, erased.table, {
      ...columnValues,
      createdBy: auditId,
      updatedBy: auditId,
    });

    await this.saveLists(erased, row.id, listValues);
    this.touch(erased, row, { created: true, fields: Object.keys(values) });
    await this.writeEvent(
      erased,
      row,
      row.version,
      baselineFields(erased, { ...row, ...listValues }),
      {},
    );

    return row as T["$inferSelect"];
  }

  /**
   * Rows from before the history have no entries yet. Their current state becomes the first
   * version, otherwise the first change could never be undone or compared.
   */
  private async ensureBaseline(entity: TrackedEntity, state: TrackedRow): Promise<void> {
    const ref: EntityRef = { entityType: entity.type, entityId: state.id };

    if (await this.repository.hasEvents(this.tx, ref)) {
      return;
    }

    const root = entity.root?.(state) ?? null;

    await this.repository.createEvent(
      this.tx,
      {
        actionId: this.actionId,
        action: BASELINE_ACTION,
        entityType: entity.type,
        entityId: state.id,
        entityVersion: state.version,
        campaignId: entity.campaignId?.(state) ?? null,
        rootType: root?.type ?? null,
        rootId: root?.id ?? null,
        actorId: null,
        reason: null,
        revertible: false,
        revertsEventId: null,
        restoredFromVersion: null,
      },
      baselineFields(entity, state),
    );
  }

  private async withLists(entity: TrackedEntity, row: TrackedRow): Promise<TrackedRow> {
    const state: TrackedRow = { ...row };

    for (const [field, rule] of Object.entries(entity.lists ?? {})) {
      state[field] = normalizeList(await rule.load(this.tx, row.id));
    }

    return state;
  }

  private async saveLists(
    entity: TrackedEntity,
    id: string,
    values: Record<string, unknown>,
  ): Promise<void> {
    for (const [field, rule] of Object.entries(entity.lists ?? {})) {
      if (field in values) {
        await rule.save(
          this.tx,
          id,
          values[field] as readonly string[],
          toAuditActorId(this.actorId),
        );
      }
    }
  }

  async change<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
    build: (current: T["$inferSelect"]) => EntityChangeInput | Promise<EntityChangeInput>,
  ): Promise<ChangeResult<T["$inferSelect"]>> {
    return this.changeInternal(entity, id, build, {});
  }

  async softDelete<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
  ): Promise<T["$inferSelect"]> {
    const result = await this.changeInternal(
      entity,
      id,
      () => ({ set: { [LIFECYCLE_FIELD]: new Date() } }),
      { lifecycle: true },
    );

    return result.row;
  }

  async changeInternal<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
    build: (current: T["$inferSelect"]) => EntityChangeInput | Promise<EntityChangeInput>,
    options: ChangeOptions,
  ): Promise<ChangeResult<T["$inferSelect"]>> {
    const erased = entity as unknown as TrackedEntity;
    const locked = await this.repository.lockRow(this.tx, erased.table, id);

    if (!locked || locked.deletedAt) {
      throw new NotFoundError("Resource not found");
    }

    const current = await this.withLists(erased, locked);

    await this.ensureBaseline(erased, current);

    const input = await build(current);
    const ref: EntityRef = { entityType: erased.type, entityId: id };

    this.assertKnownFields(erased, input, options);

    const merged: string[] = [];
    const accepted = await this.resolveSetValues(erased, ref, current, input, merged, options);
    const update: Record<string, unknown> = {};
    const fields: PendingField[] = [];

    for (const [field, value] of Object.entries(accepted)) {
      update[field] = value;

      const rule = fieldRuleOf(erased, field);

      if (rule?.kind === "ignore") {
        continue;
      }

      fields.push(this.toFieldEntry(field, rule, current[field], value, options));
    }

    const incremental = { ...current, ...update };

    for (const [field, by] of Object.entries(input.inc ?? {})) {
      const rule = fieldRuleOf(erased, field) as CounterFieldRule;
      const before = Number(incremental[field]);
      const next = clampCounter(before + by, rule, incremental);

      if (next !== before) {
        update[field] = next;
        incremental[field] = next;
        fields.push({ field, kind: "counter", newValue: next, delta: next - before });
      }
    }

    if (Object.keys(update).length === 0) {
      return { row: locked, changed: false, merged };
    }

    const next = { ...current, ...update } as TrackedRow;

    erased.validate?.(next, current);

    const columnUpdate = Object.fromEntries(
      Object.entries(update).filter(([field]) => !erased.lists?.[field]),
    );

    if (fields.length === 0) {
      const row = await this.repository.updateRow(this.tx, erased.table, id, {
        ...columnUpdate,
        updatedAt: new Date(),
      });

      this.touch(erased, row, { created: false, fields: Object.keys(update) });
      await erased.guard?.(next, current, this.tx);

      return { row, changed: true, merged };
    }

    const version = current.version + 1;
    const row = await this.repository.updateRow(this.tx, erased.table, id, {
      ...columnUpdate,
      version,
      updatedAt: new Date(),
      updatedBy: toAuditActorId(this.actorId),
    });

    await this.saveLists(erased, id, update);
    this.touch(erased, row, { created: false, fields: Object.keys(update) });
    // After writing row and lists, so whatever the guard reads from the database is the new state.
    // A rejection rolls the whole action back.
    await erased.guard?.(next, current, this.tx);
    await this.writeEvent(erased, { ...row, ...update }, version, fields, options);

    return { row, changed: true, merged };
  }

  private toFieldEntry(
    field: string,
    rule: FieldRule | undefined,
    before: unknown,
    value: unknown,
    options: ChangeOptions,
  ): PendingField {
    if (!rule && options.lifecycle) {
      return { field, kind: "lifecycle", newValue: toStoredValue(value) };
    }

    if (rule?.kind === "counter") {
      return {
        field,
        kind: "counter",
        newValue: toStoredValue(value),
        delta: Number(value) - Number(before),
      };
    }

    if (rule?.kind === "account" || rule?.kind === "secret") {
      return { field, kind: rule.kind, newValue: null };
    }

    return { field, kind: rule?.kind ?? "value", newValue: toStoredValue(value) };
  }

  private assertKnownFields(
    entity: TrackedEntity,
    input: EntityChangeInput,
    options: ChangeOptions,
  ): void {
    for (const field of Object.keys(input.set ?? {})) {
      const lifecycle = options.lifecycle && field === LIFECYCLE_FIELD;

      if (!lifecycle && !fieldRuleOf(entity, field)) {
        throw new ValidationError(`Unknown field '${field}' for '${entity.type}'`);
      }
    }

    for (const field of Object.keys(input.inc ?? {})) {
      if (fieldRuleOf(entity, field)?.kind !== "counter") {
        throw new ValidationError(`Field '${field}' of '${entity.type}' is not a counter`);
      }
    }
  }

  /**
   * Decides which `set` values are written. Without `baseVersion` the action decides alone, for
   * example a command. With it, each field goes through the three-way comparison.
   */
  private async resolveSetValues(
    entity: TrackedEntity,
    ref: EntityRef,
    current: TrackedRow,
    input: EntityChangeInput,
    merged: string[],
    options: ChangeOptions,
  ): Promise<Record<string, unknown>> {
    const set = Object.fromEntries(
      Object.entries(input.set ?? {}).map(([field, value]) => [
        field,
        entity.lists?.[field] ? normalizeList(value) : value,
      ]),
    );
    const baseVersion = input.baseVersion;
    const accepted: Record<string, unknown> = {};

    if (baseVersion !== undefined && baseVersion > current.version) {
      throw new VersionConflictError("Version is newer than the current state", {
        currentVersion: current.version,
        conflicts: [],
      });
    }

    const decisions = new Map<string, MergeDecision>();

    for (const [field, mine] of Object.entries(set)) {
      decisions.set(
        field,
        await this.decideField(entity, ref, field, mine, current, baseVersion, options),
      );
    }

    const finalDecisions = applyGroups(decisions, entity.groups ?? []);
    const conflicts = [...finalDecisions]
      .filter(([, decision]) => decision === "conflict")
      .map(([field]) => field);

    if (conflicts.length > 0) {
      throw new VersionConflictError("The content was changed by someone else", {
        currentVersion: current.version,
        conflicts: await this.describeConflicts(
          entity,
          ref,
          current,
          conflicts,
          set,
          baseVersion ?? current.version,
        ),
      });
    }

    for (const [field, decision] of finalDecisions) {
      if (decision === "apply") {
        accepted[field] = clampIfCounter(fieldRuleOf(entity, field), set[field], current);
      } else if (decision === "keepTheirs") {
        merged.push(field);
      }
    }

    return accepted;
  }

  private async decideField(
    entity: TrackedEntity,
    ref: EntityRef,
    field: string,
    mine: unknown,
    current: TrackedRow,
    baseVersion: number | undefined,
    options: ChangeOptions,
  ): Promise<MergeDecision> {
    const rule = fieldRuleOf(entity, field);
    const theirs = current[field];

    // Without a base version the action decides, and sorting has no conflicts by design.
    if (baseVersion === undefined || baseVersion === current.version || rule?.kind === "position") {
      return sameValue(mine, theirs) ? "noop" : "apply";
    }

    if (rule?.kind === "ignore" || options.lifecycle) {
      return sameValue(mine, theirs) ? "noop" : "apply";
    }

    const horizon = await this.repository.findHorizon(this.tx, ref, field);
    const changedLater = await this.repository.findLatestChangeAfter(
      this.tx,
      ref,
      field,
      baseVersion,
    );
    const changedSinceBase =
      changedLater !== null || (horizon !== null && baseVersion < horizon);
    const keepsValues = rule ? VALUE_KINDS.includes(rule.kind) : false;
    const base =
      changedSinceBase && keepsValues
        ? await this.repository.findValueAt(this.tx, ref, field, baseVersion)
        : ({ known: false } as const);

    return decideMerge({ mine, theirs, changedSinceBase, base });
  }

  private async describeConflicts(
    entity: TrackedEntity,
    ref: EntityRef,
    current: TrackedRow,
    fields: readonly string[],
    set: Record<string, unknown>,
    baseVersion: number,
  ) {
    const context = this.meta.context;
    const admin = isSysAdminRole(context.systemRole);

    return Promise.all(
      fields.map(async (field) => {
        const rule = fieldRuleOf(entity, field);
        const latest = await this.repository.findLatestChangeAfter(
          this.tx,
          ref,
          field,
          baseVersion,
        );
        const readable =
          rule !== undefined &&
          VALUE_KINDS.includes(rule.kind) &&
          (admin ||
            ((await entity.access.readField?.(context, current, field, this.tx)) ?? true));
        const changes = {
          field,
          changedBy: latest?.actorId ?? null,
          changedAt: latest?.changedAt.toISOString() ?? null,
        };

        return readable
          ? {
              ...changes,
              yours: toStoredValue(set[field]),
              current: toStoredValue(current[field]),
            }
          : changes;
      }),
    );
  }

  private touch(
    entity: TrackedEntity,
    row: TrackedRow,
    change: { created: boolean; fields: readonly string[] },
  ): void {
    const root = entity.root?.(row) ?? null;

    this.touched.push({
      entityType: entity.type,
      entityId: row.id,
      root,
      contentOfRoot: root !== null && (entity.contentOfRoot ?? true),
      ...change,
    });
  }

  private async writeEvent(
    entity: TrackedEntity,
    row: TrackedRow,
    version: number,
    fields: readonly PendingField[],
    options: ChangeOptions,
  ): Promise<void> {
    const root = entity.root?.(row) ?? null;
    const campaignId = entity.campaignId?.(row) ?? null;
    const event = await this.repository.createEvent(
      this.tx,
      {
        actionId: this.actionId,
        action: this.meta.action,
        entityType: entity.type,
        entityId: row.id,
        entityVersion: version,
        campaignId,
        rootType: root?.type ?? null,
        rootId: root?.id ?? null,
        actorId: this.actorId,
        reason: this.meta.reason ?? null,
        revertible: this.meta.revertible ?? true,
        revertsEventId: options.revertsEventId ?? null,
        restoredFromVersion: options.restoredFromVersion ?? null,
      },
      fields,
    );

    for (const item of fields) {
      const rule = fieldRuleOf(entity, item.field);

      if (rule && !item.isBaseline) {
        await this.repository.deleteOldFieldChanges(
          this.tx,
          { entityType: entity.type, entityId: row.id },
          item.field,
          limitOf(entity, rule),
        );
      }
    }

    this.events.push({
      eventId: event.id,
      actionId: this.actionId,
      action: this.meta.action,
      entityType: entity.type,
      entityId: row.id,
      entityVersion: version,
      campaignId,
      actorId: this.actorId,
      fields: fields.map((item) => item.field),
    });
  }
}

function baselineFields(entity: TrackedEntity, state: TrackedRow): PendingField[] {
  return allFieldRules(entity)
    .filter(([, rule]) => VALUE_KINDS.includes(rule.kind))
    .map(([field, rule]) => ({
      field,
      kind: rule.kind,
      newValue: toStoredValue(state[field]),
      isBaseline: true,
    }));
}

function clampCounter(value: number, rule: CounterFieldRule, row: TrackedRow): number {
  const max = typeof rule.max === "function" ? (rule.max as (item: TrackedRow) => number)(row) : rule.max;
  const upper = max === undefined ? value : Math.min(value, max);

  return rule.min === undefined ? upper : Math.max(upper, rule.min);
}

function clampIfCounter(rule: FieldRule | undefined, value: unknown, row: TrackedRow): unknown {
  return rule?.kind === "counter" ? clampCounter(Number(value), rule, row) : value;
}

/** Non-base columns of a table, used to check that an entity classifies all of them. */
export function domainColumnsOf(columns: readonly string[]): string[] {
  const base = new Set<string>(BASE_COLUMN_KEYS);

  return columns.filter((column) => !base.has(column));
}
