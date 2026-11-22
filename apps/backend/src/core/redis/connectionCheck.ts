import { randomUUID } from "node:crypto";

import type { Redis } from "#core/redis/client";

/** Resolves once the client is connected; the clients don't queue commands before that. */
export function waitForRedis(client: Redis, timeoutMs: number = 5_000): Promise<void> {
  if (client.status === "ready") {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("ready", onReady);
      reject(new Error(`Redis was not reachable within ${timeoutMs} ms`));
    }, timeoutMs);
    const onReady = () => {
      clearTimeout(timer);
      resolve();
    };

    client.once("ready", onReady);
  });
}

/**
 * What the app needs from Redis: write, read and delete a key, and a message from one connection
 * to another (realtime and queues). `subscriber` must be a second client, because a subscribed
 * connection takes no other commands.
 */
export async function checkRedisConnection(client: Redis, subscriber: Redis): Promise<void> {
  await Promise.all([waitForRedis(client), waitForRedis(subscriber)]);

  const id = randomUUID();
  const key = `redis-check:${id}`;

  await client.set(key, id, "EX", 60);

  if ((await client.get(key)) !== id) {
    throw new Error("Redis returned another value than the one written");
  }

  await client.del(key);

  const channel = `redis-check:${id}`;
  const received = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("No message arrived through Redis pub/sub")), 5_000);

    subscriber.on("message", (from: string, message: string) => {
      if (from === channel) {
        clearTimeout(timer);
        resolve(message);
      }
    });
  });

  await subscriber.subscribe(channel);
  await client.publish(channel, id);

  if ((await received) !== id) {
    throw new Error("Redis pub/sub delivered another message than the one sent");
  }

  await subscriber.unsubscribe(channel);
}
