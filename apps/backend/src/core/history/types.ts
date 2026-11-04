import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

import type { AppDatabase } from "#core/db/pool";
import type { Authorization } from "#core/history/authorization";
import type { RequestContext } from "#core/http/requestContext";

/** Number of stored changes per field for each history level. */
export const HISTORY_LIMITS = {
  minimal: 5,
  low: 20,
  standard: 50,
  high: 200,
} as const;

export type HistoryLimit = keyof typeof HISTORY_LIMITS;

export const DEFAULT_HISTORY_LIMIT: HistoryLimit = "standard";

/** Account fields never store values and use a fixed level, independent of the default. */
export const ACCOUNT_HISTORY_LIMIT: HistoryLimit = "minimal";

/** Columns from `baseColumns()`; the history handles them itself. */
export const BASE_COLUMN_KEYS = [
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "createdBy",
  "updatedBy",
] as const;

export type BaseColumnKey = (typeof BASE_COLUMN_KEYS)[number];

export type TrackedTable = AnyPgTable & {
  id: AnyPgColumn;
  version: AnyPgColumn;
  updatedAt: AnyPgColumn;
  updatedBy: AnyPgColumn;
  deletedAt: AnyPgColumn;
};

export type TrackedRow = Record<string, unknown> & {
  id: string;
  version: number;
  deletedAt: Date | null;
};

type RuleOptions = { history?: HistoryLimit };

export type ValueFieldRule = RuleOptions & { kind: "value"; revertible?: boolean };

export type CounterFieldRule = RuleOptions & {
  kind: "counter";
  revertible?: boolean;
  min?: number;
  max?: number | ((row: never) => number);
};

export type PositionFieldRule = RuleOptions & { kind: "position"; revertible?: boolean };
export type AccountFieldRule = { kind: "account" };
export type SecretFieldRule = RuleOptions & { kind: "secret" };
export type IgnoreFieldRule = { kind: "ignore" };

/**
 * A list stored in a link table, tracked as one field of the entity. The history keeps the whole
 * sorted list, so comparing, undoing and restoring work as for a single value.
 */
export type ListFieldRule = RuleOptions & {
  kind: "list";
  revertible?: boolean;
  load(db: AppDatabase, id: string): Promise<string[]>;
  save(db: AppDatabase, id: string, values: readonly string[], actorId: string): Promise<void>;
};

export type ColumnFieldRule =
  | ValueFieldRule
  | CounterFieldRule
  | PositionFieldRule
  | AccountFieldRule
  | SecretFieldRule
  | IgnoreFieldRule;

export type FieldRule = ColumnFieldRule | ListFieldRule;

export type FieldKind = FieldRule["kind"];

/** Kinds that keep a readable value in the history. */
export const VALUE_KINDS: readonly FieldKind[] = ["value", "counter", "position", "list"];

/** Change data handed to `access.revert`. */
export type RevertRequestInfo = {
  actorId: string | null;
  action: string;
  fields: readonly string[];
};

/**
 * Row-level rights of a tracked entity. Route permissions only check the system role, so this
 * decides who may see or undo what. System administrators bypass it; a missing `revert` or
 * `restore` denies everyone else.
 */
export type HistoryAccess<Row = TrackedRow> = {
  read(context: RequestContext, row: Row, db: AppDatabase): boolean | Promise<boolean>;
  readField?(
    context: RequestContext,
    row: Row,
    field: string,
    db: AppDatabase,
  ): boolean | Promise<boolean>;
  revert?(
    context: RequestContext,
    row: Row,
    change: RevertRequestInfo,
    db: AppDatabase,
  ): boolean | Promise<boolean>;
  restore?(context: RequestContext, row: Row, db: AppDatabase): boolean | Promise<boolean>;
};

export type TrackedEntity<T extends TrackedTable = TrackedTable> = {
  type: string;
  table: T;
  /** Every non-base column must be classified, so a new column cannot be stored by accident. */
  fields: Record<Exclude<keyof T["$inferSelect"] & string, BaseColumnKey>, ColumnFieldRule>;
  /** Fields without a column of their own. Their values are passed to `build` and `validate`. */
  lists?: Record<string, ListFieldRule>;
  access: HistoryAccess<T["$inferSelect"]>;
  history?: { limit?: HistoryLimit };
  /** Fields that only make sense together count as one unit in conflict checks. */
  groups?: readonly (readonly string[])[];
  campaignId?(row: T["$inferSelect"]): string | null;
  root?(row: T["$inferSelect"]): { type: string; id: string } | null;
  /** Rules across fields; throws an AppError when the merged state is invalid. */
  validate?(
    next: T["$inferSelect"] & Record<string, unknown>,
    current: T["$inferSelect"] & Record<string, unknown>,
  ): void;
  /** Base DTO used to check old values again before they are written back. */
  baseSchema?: {
    shape: Record<string, unknown>;
    pick(mask: never): { parse(value: unknown): unknown };
  };
};

export type EntityChangeInput = {
  set?: Record<string, unknown>;
  inc?: Record<string, number>;
  /** The version the client started from; enables the field-level comparison. */
  baseVersion?: number;
};

export type ChangeResult<Row> = {
  row: Row;
  /** False when nothing changed; no entry and no new version were written. */
  changed: boolean;
  /** Fields the client sent unchanged while somebody else changed them; their value stayed. */
  merged: string[];
};

/** A value at an old version; unknown when the history does not reach back that far. */
export type StoredFieldValue = { known: true; value: unknown } | { known: false };

export type ActionScope = {
  readonly actionId: string;
  /** Transaction of this action, for reads and link tables. Tracked rows only change through the scope. */
  readonly tx: AppDatabase;
  valueAt<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
    field: string,
    version: number,
  ): Promise<StoredFieldValue>;
  create<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    values: Record<string, unknown>,
  ): Promise<T["$inferSelect"]>;
  change<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
    build: (
      current: T["$inferSelect"] & Record<string, unknown>,
    ) => EntityChangeInput | Promise<EntityChangeInput>,
  ): Promise<ChangeResult<T["$inferSelect"]>>;
  softDelete<T extends TrackedTable>(
    entity: TrackedEntity<T>,
    id: string,
  ): Promise<T["$inferSelect"]>;
};

export type ActionMeta<R> = {
  action: string;
  context: RequestContext;
  /**
   * Rights check for this action. Runs first in the transaction, before an idempotency key is
   * read, so a repeated request is checked as well. Throw to deny.
   */
  authorize(db: AppDatabase): Promise<Authorization>;
  reason?: string | null;
  /** False for actions with side effects outside the database, such as an email. */
  revertible?: boolean;
  idempotency?: {
    key: string;
    onReplay(actionId: string): Promise<R>;
  };
};

/** Published after the commit. Contains no values, so hidden fields cannot leak through it. */
export type HistoryEvent = {
  eventId: string;
  actionId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityVersion: number;
  campaignId: string | null;
  actorId: string | null;
  fields: string[];
};

export type HistoryEventHandler = (event: HistoryEvent) => void | Promise<void>;

export type FieldChangeItem = {
  seq: number;
  eventId: string;
  actionId: string;
  action: string;
  entityType: string;
  entityId: string;
  version: number;
  field: string;
  kind: string;
  value: unknown;
  delta: number | null;
  redacted: boolean;
  isBaseline: boolean;
  actorId: string | null;
  reason: string | null;
  revertsEventId: string | null;
  restoredFromVersion: number | null;
  createdAt: string;
  lastChangedAt: string;
};

export type FieldChangePage = {
  data: FieldChangeItem[];
  nextBefore: number | null;
};

export type EntityVersionView = {
  entityType: string;
  entityId: string;
  version: number;
  values: Record<string, unknown>;
  /** Fields whose value at this version is no longer available. */
  incomplete: string[];
};

export type ListFieldChangesParams = {
  entityType: string;
  entityId: string;
  field?: string;
  limit: number;
  before?: number;
  includeChildren?: boolean;
};

export type GetEntityVersionParams = {
  entityType: string;
  entityId: string;
  version: number;
};

/** Public port of the history module, available as `container.ports.history`. */
export type HistoryPort = {
  register<T extends TrackedTable>(entity: TrackedEntity<T>): void;
  /** Everything registered so far, so tests can check that nothing is forgotten. */
  listEntities(): readonly TrackedEntity[];
  subscribe(pattern: string, handler: HistoryEventHandler): void;
  runAction<R>(meta: ActionMeta<R>, work: (scope: ActionScope) => Promise<R>): Promise<R>;
  /** For modules that already hold a transaction; call `publish` after their commit. */
  runActionInTransaction<R>(
    tx: AppDatabase,
    meta: ActionMeta<R>,
    work: (scope: ActionScope) => Promise<R>,
  ): Promise<{ result: R; events: HistoryEvent[] }>;
  publish(events: readonly HistoryEvent[]): Promise<void>;
  listFieldChanges(
    context: RequestContext,
    params: ListFieldChangesParams,
  ): Promise<FieldChangePage>;
  getVersion(context: RequestContext, params: GetEntityVersionParams): Promise<EntityVersionView>;
};
