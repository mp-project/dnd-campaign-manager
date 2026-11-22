import { RedisCacheStore } from "#core/cache/index";
import { closeRedisClient, type Redis } from "#core/redis/client";
import { checkRedisConnection } from "#core/redis/connectionCheck";
import { buildTestApp } from "#test/helpers/buildTestApp";
import { closeTestRedis, createTestRedis, createUnreachableRedis } from "#test/helpers/testRedis";
import { runCacheStoreContract } from "#test/unit/cacheStore.contract";

runCacheStoreContract("RedisCacheStore", async () => {
  const redis = await createTestRedis();

  return { cache: new RedisCacheStore(redis), cleanup: () => closeTestRedis(redis) };
});

describe("Redis", () => {
  let redis: Redis;

  beforeEach(async () => {
    redis = await createTestRedis();
  });

  afterEach(async () => {
    await closeTestRedis(redis);
  });

  it("passes the connection check of redis:check", async () => {
    const subscriber = await createTestRedis("subscriber");

    try {
      await expect(checkRedisConnection(redis, subscriber)).resolves.toBeUndefined();
    } finally {
      await closeTestRedis(subscriber);
    }
  });

  describe("cache", () => {
    it("stores entries and their tags with the given time", async () => {
      const cache = new RedisCacheStore(redis);

      await cache.set("short", 1, { ttlSeconds: 30, tags: ["t"] });
      await cache.set("long", 2, { ttlSeconds: 120, tags: ["t"] });
      await cache.set("shorter", 3, { ttlSeconds: 10, tags: ["t"] });

      expect(await redis.ttl("cache:short")).toBeGreaterThan(25);
      expect(await redis.ttl("cache:short")).toBeLessThanOrEqual(30);
      // The tag lives as long as its longest entry.
      expect(await redis.ttl("cache-tag:t")).toBeGreaterThan(115);
    });

    it("behaves like an empty cache while Redis is down", async () => {
      const down = createUnreachableRedis();
      const cache = new RedisCacheStore(down);

      try {
        await expect(cache.set("k", 1, { ttlSeconds: 60, tags: ["t"] })).resolves.toBeUndefined();
        await expect(cache.get("k")).resolves.toBeUndefined();
        await expect(cache.delete("k")).resolves.toBeUndefined();
        await expect(cache.invalidateTags("t")).resolves.toBeUndefined();
      } finally {
        await closeRedisClient(down);
      }
    });
  });

  describe("rate limits", () => {
    const ping = (session: ReturnType<typeof buildTestApp>) =>
      session.app.inject({ method: "GET", url: "/api/v1/ping" });

    it("count across all API instances", async () => {
      const first = buildTestApp({ redis });
      const second = buildTestApp({ redis });

      try {
        // 60 reads per 10 seconds and route, shared by both instances.
        for (let index = 0; index < 30; index += 1) {
          expect((await ping(first)).statusCode).toBe(200);
          expect((await ping(second)).statusCode).toBe(200);
        }

        const refused = await ping(first);

        expect(refused.statusCode).toBe(429);
        expect(refused.headers["x-ratelimit-limit"]).toBe("60");
        expect((await ping(second)).statusCode).toBe(429);
        expect(await redis.keys("rate-limit:*")).not.toHaveLength(0);
      } finally {
        await Promise.all([first.app.close(), second.app.close()]);
      }
    });

    it("let requests through while Redis is down", async () => {
      const down = createUnreachableRedis();
      const session = buildTestApp({ redis: down });

      try {
        for (let index = 0; index < 61; index += 1) {
          expect((await ping(session)).statusCode).toBe(200);
        }
      } finally {
        await session.app.close();
        await closeRedisClient(down);
      }
    });
  });
});
