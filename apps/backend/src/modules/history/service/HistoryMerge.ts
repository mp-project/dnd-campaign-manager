export type MergeDecision = "noop" | "apply" | "keepTheirs" | "conflict";

export type MergeInput = {
  mine: unknown;
  theirs: unknown;
  /** Whether the field may have changed since the version the client started from. */
  changedSinceBase: boolean;
  base: { known: true; value: unknown } | { known: false };
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value ?? null);
}

/** JSON form of a column value, as it is stored in the history. */
export function toStoredValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value ?? null;
}

export function sameValue(left: unknown, right: unknown): boolean {
  return stableStringify(toStoredValue(left)) === stableStringify(toStoredValue(right));
}

/**
 * Three-way comparison of one field. `mine` is what the client sent, `theirs` the current value
 * and `base` the value at the version the client started from.
 */
export function decideMerge(input: MergeInput): MergeDecision {
  const { mine, theirs, changedSinceBase, base } = input;

  if (sameValue(mine, theirs)) {
    return "noop";
  }

  if (!changedSinceBase) {
    return "apply";
  }

  if (!base.known) {
    return "conflict";
  }

  if (sameValue(theirs, base.value)) {
    return "apply";
  }

  return sameValue(mine, base.value) ? "keepTheirs" : "conflict";
}

/**
 * Applies field groups: a group counts as one unit, so it cannot end up half mine and half theirs.
 */
export function applyGroups(
  decisions: ReadonlyMap<string, MergeDecision>,
  groups: readonly (readonly string[])[],
): Map<string, MergeDecision> {
  const result = new Map(decisions);

  for (const group of groups) {
    const inGroup = group.filter((field) => result.has(field));
    const states = inGroup.map((field) => result.get(field));
    const mixed = states.includes("apply") && states.includes("keepTheirs");

    if (states.includes("conflict") || mixed) {
      for (const field of inGroup) {
        if (result.get(field) !== "noop") {
          result.set(field, "conflict");
        }
      }
    }
  }

  return result;
}
