import { MemoryCacheStore } from "#core/cache/memoryCacheStore";
import type { CacheStore } from "#core/cache/port";
import { RedisCacheStore } from "#core/cache/redisCacheStore";
import type { Redis } from "#core/redis/client";

export * from "#core/cache/memoryCacheStore";
export * from "#core/cache/port";
export * from "#core/cache/redisCacheStore";

/** Shared through Redis when there is one, else one cache per process. */
export function createCacheStore(redis: Redis | undefined): CacheStore {
  return redis ? new RedisCacheStore(redis) : new MemoryCacheStore();
}
