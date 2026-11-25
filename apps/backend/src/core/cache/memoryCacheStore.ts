import type { CacheSetOptions, CacheStore } from "#core/cache/port";

type Entry = { json: string; expiresAt: number; tags: readonly string[] };

const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * The cache of one process, for development without Redis and for tests. Values are stored as JSON
 * like in Redis, so a caller can't change a cached object by accident. The oldest entries go first
 * when it is full.
 */
export class MemoryCacheStore implements CacheStore {
  readonly driver = "memory";

  private readonly entries = new Map<string, Entry>();
  private readonly keysByTag = new Map<string, Set<string>>();

  constructor(
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= this.now()) {
      this.remove(key);
      return undefined;
    }

    return JSON.parse(entry.json) as T;
  }

  async set(key: string, value: unknown, options: CacheSetOptions): Promise<void> {
    this.remove(key);

    const tags = options.tags ?? [];

    this.entries.set(key, {
      json: JSON.stringify(value),
      expiresAt: this.now() + options.ttlSeconds * 1000,
      tags,
    });

    for (const tag of tags) {
      this.keysByTag.set(tag, (this.keysByTag.get(tag) ?? new Set()).add(key));
    }

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;

      if (oldest === undefined) {
        break;
      }

      this.remove(oldest);
    }
  }

  async delete(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.remove(key);
    }
  }

  async invalidateTags(...tags: string[]): Promise<void> {
    for (const tag of tags) {
      for (const key of [...(this.keysByTag.get(tag) ?? [])]) {
        this.remove(key);
      }

      this.keysByTag.delete(tag);
    }
  }

  /** Empties the cache; for tests, whose database starts empty again. */
  clear(): void {
    this.entries.clear();
    this.keysByTag.clear();
  }

  private remove(key: string): void {
    const entry = this.entries.get(key);

    if (!entry) {
      return;
    }

    this.entries.delete(key);

    for (const tag of entry.tags) {
      const keys = this.keysByTag.get(tag);

      keys?.delete(key);

      if (keys?.size === 0) {
        this.keysByTag.delete(tag);
      }
    }
  }
}
