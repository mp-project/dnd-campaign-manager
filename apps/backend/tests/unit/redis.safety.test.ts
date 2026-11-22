import { assertSafeTestRedisUrl } from "#core/redis/client";

describe("assertSafeTestRedisUrl", () => {
  it("accepts local servers and the test service with a database other than 0", () => {
    expect(() => assertSafeTestRedisUrl("redis://127.0.0.1:56379/1")).not.toThrow();
    expect(() => assertSafeTestRedisUrl("redis://localhost:6379/15")).not.toThrow();
    expect(() => assertSafeTestRedisUrl("redis://redis-test:6379/1")).not.toThrow();
  });

  it("refuses database 0 and other hosts", () => {
    expect(() => assertSafeTestRedisUrl("redis://127.0.0.1:56380")).toThrow();
    expect(() => assertSafeTestRedisUrl("redis://127.0.0.1:56380/0")).toThrow();
    expect(() => assertSafeTestRedisUrl("redis://:secret@redis:6379/1")).toThrow();
    expect(() => assertSafeTestRedisUrl("redis://cache.example.com:6379/1")).toThrow();
  });
});
