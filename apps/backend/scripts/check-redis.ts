import { getEnv } from "#core/env";
import { runScript } from "#core/log/processErrors";
import { createScriptLogger } from "#core/log/scriptLogger";
import { closeRedisClient, createRedisClient } from "#core/redis/client";
import { checkRedisConnection } from "#core/redis/connectionCheck";

const logger = createScriptLogger("redis-check");

/** Checks the Redis of the current environment (`REDIS_URL`), like the server would use it. */
async function runCheck(): Promise<void> {
  const { REDIS_URL } = getEnv();

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is not set; the app would count rate limits and cache per process");
  }

  const url = new URL(REDIS_URL);

  logger.info({ host: url.host, database: url.pathname.replace(/^\//, "") || "0" }, "Checking Redis");

  const client = createRedisClient(REDIS_URL, logger, "redis-check");
  const subscriber = createRedisClient(REDIS_URL, logger, "redis-check-subscriber");

  try {
    await checkRedisConnection(client, subscriber);
    logger.info("Redis is reachable: write, read, delete and pub/sub succeeded");
  } finally {
    await Promise.all([closeRedisClient(client), closeRedisClient(subscriber)]);
  }
}

void runScript(logger, "redis-check", runCheck);
