import type { CacheSetOptions, CacheStore } from "#core/cache/port";
import { warnFallback } from "#core/log/warnFallback";
import type { Redis } from "#core/redis/client";

const KEY_PREFIX = "cache:";
const TAG_PREFIX = "cache-tag:";

/**
 * Deletes the members of each tag set and the set itself in one step, so an entry stored while
 * the tag is being dropped either goes with it or is added to a fresh set.
 */
const INVALIDATE_TAGS_SCRIPT = `
for _, tag in ipairs(KEYS) do
  local members = redis.call('SMEMBERS', tag)
  for i = 1, #members, 500 do
    redis.call('DEL', unpack(members, i, math.min(i + 499, #members)))
  end
  redis.call('DEL', tag)
end
return 0
`;

/**
 * The shared cache of all API instances. A tag is a set of the keys stored with it; it lives as
 * long as its longest entry. Failures of Redis are logged and treated as a miss or a skipped
 * write (see `CacheStore`).
 */
export class RedisCacheStore implements CacheStore {
  readonly driver = "redis";

  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const json = await this.redis.get(KEY_PREFIX + key);

      return json === null ? undefined : (JSON.parse(json) as T);
    } catch (error) {
      // Documented fallback: an unreachable cache is a miss, the caller reads the database.
      warnFallback(error, "Cache read failed; treated as a miss", { key });
      return undefined;
    }
  }

  async set(key: string, value: unknown, options: CacheSetOptions): Promise<void> {
    const stored = KEY_PREFIX + key;
    const transaction = this.redis.multi().set(stored, JSON.stringify(value), "EX", options.ttlSeconds);

    for (const tag of options.tags ?? []) {
      const tagKey = TAG_PREFIX + tag;

      // A new set gets the entry's time; an existing one only ever gets longer.
      transaction
        .sadd(tagKey, stored)
        .expire(tagKey, options.ttlSeconds, "NX")
        .expire(tagKey, options.ttlSeconds, "GT");
    }

    try {
      await transaction.exec();
    } catch (error) {
      // Documented fallback: without the cache the next read goes to the database.
      warnFallback(error, "Cache write failed; skipped", { key });
    }
  }

  async delete(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    try {
      await this.redis.del(...keys.map((key) => KEY_PREFIX + key));
    } catch (error) {
      // Documented fallback: the entries end with their TTL, which is why rights get a short one.
      warnFallback(error, "Cache delete failed; entries stay until they expire", { keys });
    }
  }

  async invalidateTags(...tags: string[]): Promise<void> {
    if (tags.length === 0) {
      return;
    }

    try {
      await this.redis.eval(
        INVALIDATE_TAGS_SCRIPT,
        tags.length,
        ...tags.map((tag) => TAG_PREFIX + tag),
      );
    } catch (error) {
      // Documented fallback: the entries end with their TTL, which is why rights get a short one.
      warnFallback(error, "Cache invalidation failed; entries stay until they expire", { tags });
    }
  }
}
