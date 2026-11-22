import { createLogger } from "#core/log/logger";
import { assertSafeTestRedisUrl, closeRedisClient, createRedisClient, type Redis } from "#core/redis/client";
import { waitForRedis } from "#core/redis/connectionCheck";

export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379/1";

const silentLogger = createLogger({
  service: "test-redis",
  level: "silent",
  pretty: false,
  environment: "test",
});

/**
 * A client for the test Redis (compose profile `test`), connected and with its database emptied.
 * Close it with `closeTestRedis`.
 */
export async function createTestRedis(name = "test"): Promise<Redis> {
  assertSafeTestRedisUrl(TEST_REDIS_URL);

  const client = createRedisClient(TEST_REDIS_URL, silentLogger, name);

  await waitForRedis(client);
  await client.flushdb();

  return client;
}

export async function closeTestRedis(client: Redis): Promise<void> {
  await closeRedisClient(client);
}

/** A client for a port nobody listens on: Redis as it looks when it is down. */
export function createUnreachableRedis(): Redis {
  return createRedisClient("redis://127.0.0.1:1/1", silentLogger, "unreachable");
}
