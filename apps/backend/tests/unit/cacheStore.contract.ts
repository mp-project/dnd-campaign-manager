import type { CacheStore } from "#core/cache/port";

/** What every `CacheStore` does; run against the in-memory store (unit) and Redis (integration). */
export function runCacheStoreContract(
  name: string,
  create: () => Promise<{ cache: CacheStore; cleanup?: () => Promise<void> }>,
): void {
  describe(`${name} (CacheStore contract)`, () => {
    let cache: CacheStore;
    let cleanup: (() => Promise<void>) | undefined;

    beforeEach(async () => {
      ({ cache, cleanup } = await create());
    });

    afterEach(async () => {
      await cleanup?.();
    });

    it("stores JSON values and misses unknown keys", async () => {
      await cache.set("campaign:1", { name: "Elaria", tags: ["a"], level: 3, gm: null }, { ttlSeconds: 60 });

      await expect(cache.get("campaign:1")).resolves.toEqual({
        name: "Elaria",
        tags: ["a"],
        level: 3,
        gm: null,
      });
      await expect(cache.get("campaign:2")).resolves.toBeUndefined();
    });

    it("hands out copies, so a caller can't change the cached value", async () => {
      const value = { list: [1] };

      await cache.set("k", value, { ttlSeconds: 60 });
      value.list.push(2);
      (await cache.get<{ list: number[] }>("k"))!.list.push(3);

      await expect(cache.get("k")).resolves.toEqual({ list: [1] });
    });

    it("replaces values and deletes several keys at once", async () => {
      await cache.set("a", 1, { ttlSeconds: 60 });
      await cache.set("a", 2, { ttlSeconds: 60 });
      await cache.set("b", 3, { ttlSeconds: 60 });
      await cache.set("c", 4, { ttlSeconds: 60 });
      await cache.delete("a", "b", "missing");

      await expect(cache.get("a")).resolves.toBeUndefined();
      await expect(cache.get("b")).resolves.toBeUndefined();
      await expect(cache.get("c")).resolves.toBe(4);
      await cache.delete();
    });

    it("drops every entry of a tag, and only those", async () => {
      await cache.set("one", 1, { ttlSeconds: 60, tags: ["campaign:1"] });
      await cache.set("both", 2, { ttlSeconds: 60, tags: ["campaign:1", "user:1"] });
      await cache.set("other", 3, { ttlSeconds: 60, tags: ["campaign:2"] });
      await cache.set("untagged", 4, { ttlSeconds: 60 });

      await cache.invalidateTags("campaign:1", "unknown");

      await expect(cache.get("one")).resolves.toBeUndefined();
      await expect(cache.get("both")).resolves.toBeUndefined();
      await expect(cache.get("other")).resolves.toBe(3);
      await expect(cache.get("untagged")).resolves.toBe(4);

      // The tag starts over: what is stored with it later is dropped with it again.
      await cache.set("again", 5, { ttlSeconds: 60, tags: ["campaign:1"] });
      await cache.invalidateTags("campaign:1");
      await expect(cache.get("again")).resolves.toBeUndefined();
      await cache.invalidateTags();
    });
  });
}
