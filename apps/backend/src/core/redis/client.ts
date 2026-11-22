import { Redis } from "ioredis";

import type { AppLogger } from "#core/log/logger";

export type { Redis } from "ioredis";

/**
 * Redis carries rate limits, caches and (later) realtime and queues, never the truth: when it is
 * gone the API keeps answering. So a command fails fast instead of waiting in ioredis' offline
 * queue, which would hold every request until Redis is back.
 */
const CLIENT_OPTIONS = {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 2_000,
  commandTimeout: 1_000,
  // Reconnects keep trying, at most every 5 s.
  retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
} as const;

/**
 * A client for `url` (`redis://[:password@]host:port/db`). It connects in the background and logs
 * when Redis becomes unreachable and when it is back, once each, not on every failed reconnect.
 */
export function createRedisClient(url: string, logger: AppLogger, name: string): Redis {
  const client = new Redis(url, { ...CLIENT_OPTIONS, connectionName: name });
  let reachable = true;

  client.on("error", (error: unknown) => {
    if (reachable) {
      reachable = false;
      logger.warn({ err: error, redis: name }, "Redis is not reachable; caches and shared rate limits pause");
    }
  });
  client.on("ready", () => {
    if (!reachable) {
      reachable = true;
      logger.info({ redis: name }, "Redis is reachable again");
    }
  });

  return client;
}

/** Waits for pending replies; a client that can't reach Redis is dropped at once. */
export async function closeRedisClient(client: Redis): Promise<void> {
  if (client.status !== "ready") {
    client.disconnect();
    return;
  }

  await client.quit();
}

/**
 * Tests flush their Redis database, so they refuse anything but a local server (or the compose
 * service `redis-test`) and a database other than 0, which development uses.
 */
export function assertSafeTestRedisUrl(redisUrl: string): void {
  const url = new URL(redisUrl);
  const host = url.hostname.toLowerCase();
  const isLocalHost = host === "127.0.0.1" || host === "localhost" || host === "redis-test";
  const database = Number.parseInt(url.pathname.replace(/^\//, "") || "0", 10);

  if (!isLocalHost || !Number.isInteger(database) || database === 0) {
    throw new Error("Refusing test Redis operation for a non-test REDIS_URL.");
  }
}
