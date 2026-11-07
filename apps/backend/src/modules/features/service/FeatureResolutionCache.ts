import { createHash } from "node:crypto";

import type { ResolvedFeatureGraph } from "#src/modules/features/domain/FeatureResolver";

export type FeatureResolutionKey = {
  featureId: string;
  assetId: string;
  /** Version of the feature row and of its asset; a change of either is a new entry. */
  version: number;
  assetVersion: number;
  rulesetId: string;
  bindings: unknown;
  actor: unknown;
  /** Asset ids the viewer may choose through a filter. */
  allowedSelections: readonly string[];
};

const DEFAULT_MAX_ENTRIES = 1_000;

/** JSON with sorted object keys, so equal inputs give equal keys. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

/**
 * Results of `resolveFeature` in this process, least recently used first out. The key contains the
 * versions of feature and asset, so a changed definition never hits an old entry; `invalidate`
 * frees the memory of a feature right after it changed.
 */
export class FeatureResolutionCache {
  private readonly entries = new Map<
    string,
    { value: ResolvedFeatureGraph; entityIds: readonly string[] }
  >();
  private readonly keysByEntity = new Map<string, Set<string>>();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  static keyOf(input: FeatureResolutionKey): string {
    return createHash("sha256").update(stableStringify(input)).digest("hex");
  }

  get(key: string): ResolvedFeatureGraph | undefined {
    const entry = this.entries.get(key);

    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }

    return entry?.value;
  }

  set(key: string, entityIds: readonly string[], value: ResolvedFeatureGraph): void {
    this.remove(key);
    this.entries.set(key, { value, entityIds });

    for (const id of entityIds) {
      const keys = this.keysByEntity.get(id) ?? new Set<string>();

      keys.add(key);
      this.keysByEntity.set(id, keys);
    }

    while (this.entries.size > this.maxEntries) {
      this.remove(this.entries.keys().next().value as string);
    }
  }

  /** Drops the entries of a feature, by feature or asset id. */
  invalidate(entityId: string): void {
    for (const key of [...(this.keysByEntity.get(entityId) ?? [])]) {
      this.remove(key);
    }
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    this.entries.delete(key);

    for (const id of entry.entityIds) {
      const keys = this.keysByEntity.get(id);

      keys?.delete(key);

      if (keys?.size === 0) {
        this.keysByEntity.delete(id);
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
