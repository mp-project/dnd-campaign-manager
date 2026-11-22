export type CacheSetOptions = {
  /** Always required: a cache entry without expiry would outlive a missed invalidation. */
  ttlSeconds: number;
  /** Groups to drop the entry with, e.g. everything of one campaign. */
  tags?: readonly string[];
};

/**
 * Short-lived copies of data whose truth is elsewhere (Postgres). Values are JSON. A cache that
 * can't be reached behaves like an empty one: reads miss and writes are skipped, so callers always
 * have their way to the database. Entries that grant rights need a short TTL, because an
 * invalidation that fails while the cache is unreachable only ends with it.
 */
export type CacheStore = {
  readonly driver: "redis" | "memory";
  /** `undefined` on a miss. */
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, options: CacheSetOptions): Promise<void>;
  delete(...keys: string[]): Promise<void>;
  /** Drops every entry stored with one of these tags. */
  invalidateTags(...tags: string[]): Promise<void>;
};
