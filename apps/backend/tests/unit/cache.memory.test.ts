import { createCacheStore, MemoryCacheStore } from "#core/cache/index";
import { runCacheStoreContract } from "#test/unit/cacheStore.contract";

runCacheStoreContract("MemoryCacheStore", async () => ({ cache: new MemoryCacheStore() }));

describe("MemoryCacheStore", () => {
  it("forgets entries when their time is up", async () => {
    let now = 1_000_000;
    const cache = new MemoryCacheStore(100, () => now);

    await cache.set("k", "v", { ttlSeconds: 30 });
    now += 29_999;
    await expect(cache.get("k")).resolves.toBe("v");
    now += 1;
    await expect(cache.get("k")).resolves.toBeUndefined();
  });

  it("drops the oldest entries when it is full", async () => {
    const cache = new MemoryCacheStore(2);

    await cache.set("a", 1, { ttlSeconds: 60, tags: ["t"] });
    await cache.set("b", 2, { ttlSeconds: 60 });
    await cache.set("c", 3, { ttlSeconds: 60 });

    await expect(cache.get("a")).resolves.toBeUndefined();
    await expect(cache.get("b")).resolves.toBe(2);
    await expect(cache.get("c")).resolves.toBe(3);
  });

  it("is the cache without Redis", () => {
    expect(createCacheStore(undefined).driver).toBe("memory");
  });
});
