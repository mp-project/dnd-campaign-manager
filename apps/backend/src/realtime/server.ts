import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

import { createAdapter } from "@socket.io/redis-streams-adapter";
import { Server } from "socket.io";

import { createCacheStore } from "#core/cache/index";
import { createDrizzleDb, createPgPool, createTransactionManager } from "#core/db/pool";
import { getEnv } from "#core/env";
import { getErrorReporter } from "#core/log/errorReporter";
import { createLogger, loggerSettingsFromEnv } from "#core/log/logger";
import { installProcessErrorHandlers } from "#core/log/processErrors";
import { reportError } from "#core/log/reportError";
import { REALTIME_PATH } from "#core/realtime/messages";
import { closeRedisClient, createRedisClient } from "#core/redis/client";
import { warnMissingIntegrations } from "#core/runtime/integrations";
import { shutdownTelemetry } from "#core/telemetry/lifecycle";
import { AccountRepository } from "#src/modules/auth/domain/repository/AccountRepository";
import { AccountCache } from "#src/modules/auth/service/AccountCache";
import { AccountService } from "#src/modules/auth/service/AccountService";
import { createClerkIdentityPort } from "#src/modules/auth/service/ClerkIdentityPort";
import { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { attachRealtimeGateway, type RealtimeServer } from "#src/realtime/RealtimeGateway";

/**
 * A short interruption (mobile network, sleeping tab) is bridged: the adapter keeps the socket's
 * rooms and the messages it missed, and the client gets them on reconnect. After that the client
 * loads its data again.
 */
const RECOVERY_WINDOW_MS = 2 * 60 * 1000;

/** Probes of the cluster and compose. Socket.IO answers its own path before this listener. */
function answerProbe(request: IncomingMessage, response: ServerResponse): void {
  if (request.url === "/health" || request.url === "/ready") {
    response.writeHead(200, { "content-type": "application/json" }).end('{"status":"ok"}');
    return;
  }

  response.writeHead(404).end();
}

/**
 * The realtime gateway: a process of its own, so a deploy of the API keeps the connections. It
 * holds the sockets, checks the session and campaign roles like the API (same identity provider,
 * account service and campaign access) and passes on what the API and the workers send through
 * Redis Streams. While Redis is not connected it refuses connections, so clients keep their own
 * checks instead of waiting for messages that can't arrive.
 */
async function runGateway(): Promise<void> {
  const env = getEnv();
  const logger = createLogger(loggerSettingsFromEnv(env, "realtime"));
  const pool = createPgPool(env.DATABASE_URL);
  const db = createDrizzleDb(pool);
  const cacheRedis = env.REDIS_URL ? createRedisClient(env.REDIS_URL, logger, "realtime") : undefined;
  const adapterRedis = env.REDIS_URL
    ? createRedisClient(env.REDIS_URL, logger, "realtime-adapter", { blocking: true })
    : undefined;
  const identityPort = createClerkIdentityPort(env);
  const accountService = new AccountService(
    db,
    createTransactionManager(db),
    new AccountRepository(),
    identityPort,
    new AccountCache(createCacheStore(cacheRedis)),
    { bootstrapMaintainerEmail: env.BOOTSTRAP_MAINTAINER_EMAIL },
  );
  const campaigns = new CampaignsRepository();
  const httpServer = createServer(answerProbe);
  const io: RealtimeServer = new Server(httpServer, {
    path: REALTIME_PATH,
    cors: {
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
      credentials: true,
    },
    // Messages are references, never large.
    maxHttpBufferSize: 16 * 1024,
    connectionStateRecovery: { maxDisconnectionDuration: RECOVERY_WINDOW_MS, skipMiddlewares: false },
    ...(adapterRedis ? { adapter: createAdapter(adapterRedis) } : {}),
  });

  installProcessErrorHandlers(logger, () => pool.end());
  warnMissingIntegrations(logger, env, ["clerk", "redis"]);

  // Named in every environment (the general Redis warning is only for stage and production):
  // without Redis this gateway refuses every connection.
  if (!adapterRedis) {
    logger.warn(
      { integration: "realtime", missing: ["REDIS_URL"] },
      "Realtime gateway has no Redis: connections are refused, there are no live updates",
    );
  }

  attachRealtimeGateway(io, {
    identityPort,
    accountPort: accountService,
    resolveCampaignAccess: ({ campaignId, actorId }) =>
      campaigns.resolveCampaignAccess({ db, campaignId, actorId }),
    logger,
    // Without Redis nothing the API sends arrives here.
    isAvailable: () => adapterRedis?.status === "ready",
  });

  let stopping = false;

  async function stop(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "Realtime gateway stopping");

    try {
      // Clients reconnect to another instance or to this one after the restart.
      await io.close();
      await pool.end();
      if (cacheRedis) await closeRedisClient(cacheRedis);
      if (adapterRedis) await closeRedisClient(adapterRedis);
    } catch (error) {
      reportError(logger, error, "Realtime gateway did not stop cleanly", { task: "shutdown" });
    } finally {
      await getErrorReporter().flush();
      await shutdownTelemetry();
      process.exit(0);
    }
  }

  process.once("SIGTERM", () => void stop("SIGTERM"));
  process.once("SIGINT", () => void stop("SIGINT"));

  httpServer.listen(env.REALTIME_PORT, env.HOST, () => {
    logger.info({ port: env.REALTIME_PORT }, "Realtime gateway started");
  });
}

const isInvokedDirectly = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (isInvokedDirectly) {
  void runGateway();
}
