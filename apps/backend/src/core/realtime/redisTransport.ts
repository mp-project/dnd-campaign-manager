import { Emitter } from "@socket.io/redis-streams-emitter";

import type { InvalidateMessage, RealtimeServerToClientEvents } from "#core/realtime/messages";
import type { RealtimeTransport } from "#core/realtime/broker";
import type { Redis } from "#core/redis/client";

/** The API passes Fastify's logger, the workers their own. */
export type WarnLogger = { warn(fields: object, message: string): void };

/**
 * The only command the emitter sends. The emitter drops the promise of its `XADD`; while Redis is
 * away that would be an unhandled rejection, which ends the process. So the emitter gets this
 * client, which catches it: the first failure of a series is a warning (the Redis client itself
 * says once that Redis is gone), the rest is quiet until a message goes out again.
 */
function guardedStreamClient(redis: Redis, logger: WarnLogger): { xadd: (args: (string | number)[]) => Promise<void> } {
  let failing = false;

  return {
    xadd: async (args) => {
      try {
        await redis.xadd(...(args as Parameters<Redis["xadd"]>));
        failing = false;
      } catch (error) {
        // A lost live update only; clients load again when they reconnect.
        if (!failing) {
          failing = true;
          logger.warn({ err: error, task: "realtime.publish" }, "Realtime message not sent; live updates pause");
        }
      }
    },
  };
}

/**
 * Sends to the gateways through Redis Streams (`@socket.io/redis-streams-emitter`), which the
 * gateways read with the matching adapter. No socket server in this process.
 */
export function createRedisRealtimeTransport(redis: Redis, logger: WarnLogger): RealtimeTransport {
  const emitter = new Emitter<RealtimeServerToClientEvents>(guardedStreamClient(redis, logger));

  return {
    emitInvalidate: (room: string, message: InvalidateMessage) => {
      emitter.to(room).emit("invalidate", message);
    },
    disconnect: (room: string) => {
      emitter.in(room).disconnectSockets(true);
    },
    leave: (room: string, rooms: string[]) => {
      emitter.in(room).socketsLeave(rooms);
    },
  };
}
