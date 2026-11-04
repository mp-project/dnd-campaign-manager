import type {
  AccountFieldRule,
  CounterFieldRule,
  IgnoreFieldRule,
  PositionFieldRule,
  SecretFieldRule,
  TrackedEntity,
  TrackedTable,
  ValueFieldRule,
} from "#core/history/types";

/** Field kinds for `defineTrackedEntity`. */
export const field = {
  value: (options: Omit<ValueFieldRule, "kind"> = {}): ValueFieldRule => ({
    kind: "value",
    ...options,
  }),
  counter: <Row = never>(
    options: Omit<CounterFieldRule, "kind" | "max"> & {
      max?: number | ((row: Row) => number);
    } = {},
  ): CounterFieldRule => ({ kind: "counter", ...options }) as CounterFieldRule,
  position: (options: Omit<PositionFieldRule, "kind"> = {}): PositionFieldRule => ({
    kind: "position",
    ...options,
  }),
  account: (): AccountFieldRule => ({ kind: "account" }),
  secret: (options: Omit<SecretFieldRule, "kind"> = {}): SecretFieldRule => ({
    kind: "secret",
    ...options,
  }),
  ignore: (): IgnoreFieldRule => ({ kind: "ignore" }),
};

/**
 * Describes how a table takes part in the history. The module registers the result with
 * `container.ports.history.register` in its `Setup.ts`.
 */
export function defineTrackedEntity<T extends TrackedTable>(
  entity: TrackedEntity<T>,
): TrackedEntity<T> {
  return entity;
}
