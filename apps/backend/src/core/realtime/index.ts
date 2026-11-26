import {
  CoalescingRealtimeBroker,
  NOOP_REALTIME_TRANSPORT,
  type RealtimeBroker,
} from "#core/realtime/broker";
import { createRedisRealtimeTransport, type WarnLogger } from "#core/realtime/redisTransport";
import type { Redis } from "#core/redis/client";

export * from "#core/realtime/broker";
export * from "#core/realtime/messages";
export * from "#core/realtime/rooms";

/** Through Redis to the gateways; without Redis nothing reaches them, so nothing is sent. */
export function createRealtimeBroker(redis: Redis | undefined, logger: WarnLogger): RealtimeBroker {
  return new CoalescingRealtimeBroker(
    redis ? createRedisRealtimeTransport(redis, logger) : NOOP_REALTIME_TRANSPORT,
  );
}
