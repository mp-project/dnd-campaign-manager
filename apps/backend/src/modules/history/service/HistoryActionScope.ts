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

/** Marks the soft-delete entry; it is not a column rule and never comes from a client. */
export const LIFECYCLE_FIELD = "deletedAt";

/** Internal options of `change`, used by revert and restore. */
export type ChangeOptions = {
  includeDeleted?: boolean;
  revertsEventId?: string;
  restoredFromVersion?: number;
  lifecycle?: boolean;
};

export function fieldRuleOf(entity: TrackedEntity, field: string): FieldRule | undefined {
  return (entity.fields as Record<string, FieldRule>)[field];
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

  constructor(
    readonly tx: AppDatabase,
    private readonly repository: HistoryRepository,
    readonly actionId: string,
    private readonly meta: Pick<ActionMeta<unknown>, "action" | "context" | "reason" | "revertible">,
  ) {}

  private get actorId(): string | null {
    return this.meta.context.actorId;
  }

  async create<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    values: Record<string, unknown>,
  ): Promise<T["$inferSelect"]> {
    const erased = entity as unknown as TrackedEntity;
    const auditId = toAuditActorId(this.actorId);
    const row = await this.repository.insertRow(this.tx, erased.table, {
      ...values,
      createdBy: auditId,
      updatedBy: auditId,
    });

    const fields: PendingField[] = [];

    for (const [field, rule] of Object.entries(erased.fields as Record<string, FieldRule>)) {
      if (VALUE_KINDS.includes(rule.kind)) {
        fields.push({
          field,
          kind: rule.kind,
          newValue: toStoredValue(row[field]),
          isBaseline: true,
        });
      }
    }

    await this.writeEvent(erased, row, row.version, fields, {});

    return row as T["$inferSelect"];
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
    const current = await this.repository.lockRow(this.tx, erased.table, id);

    if (!current || (current.deletedAt && !options.includeDeleted)) {
      throw new NotFoundError("Resource not found");
    }

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
      return { row: current, changed: false, merged };
    }

    const next = { ...current, ...update } as TrackedRow;

    erased.validate?.(next, current);

    if (fields.length === 0) {
      const row = await this.repository.updateRow(this.tx, erased.table, id, {
        ...update,
        updatedAt: new Date(),
      });

      return { row, changed: true, merged };
    }

    const version = current.version + 1;
    const row = await this.repository.updateRow(this.tx, erased.table, id, {
      ...update,
      version,
      updatedAt: new Date(),
      updatedBy: toAuditActorId(this.actorId),
    });

    await this.writeEvent(erased, row, version, fields, options);

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
    const set = input.set ?? {};
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
