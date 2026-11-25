import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import {
  createAppContainer,
  type AppPublicPorts,
} from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  checkDatabaseReadiness,
  createPgPool,
  type ReadyState,
} from "#core/db/pool";
import { getEnv, type AppEnv } from "#core/env";
import { closeRedisClient, createRedisClient, type Redis } from "#core/redis/client";
import { API_BASE_PATH } from "#core/config/constants";
import { registerErrorHandler } from "#core/error/registerErrorHandler";
import { getErrorReporter } from "#core/log/errorReporter";
import { createLogger, loggerSettingsFromEnv, type AppLogger } from "#core/log/logger";
import { registerRequestLogActor, registerRequestLogging } from "#core/log/requestLog";
import { registerAuthorizationPlugin } from "#core/http/authorization";
import { registerApiRoutes } from "#core/http/registerApiRoutes";
import { registerOpenApi } from "#core/http/registerOpenApi";
import {
  registerAuthPlugin,
  registerCampaignContextPlugin,
  registerRequestContextPlugin,
  registerSecurityPlugins,
} from "#core/http/securityAndContext";
import {
  notFound,
  registerHealthRoutes,
} from "#core/http/systemRoutes";
import {
  defaultAppModules,
} from "#src/modules/index";

type BuildAppOptions = {
  env?: AppEnv;
  /** Defaults to a logger built from `env`; tests pass one whose lines they read. */
  logger?: AppLogger;
  pool?: Pool;
  readyProbe?: () => Promise<ReadyState>;
  modules?: readonly AppModule[];
  publicPorts?: AppPublicPorts;
  closePoolOnShutdown?: boolean;
  /**
   * Redis for rate limits and caches; `null` runs without one. By default a client for
   * `REDIS_URL`, closed with the app.
   */
  redis?: Redis | null;
};

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? getEnv();
  const logger = options.logger ?? createLogger(loggerSettingsFromEnv(env, "api"));
  const baseApp = Fastify({
    // Typed as Fastify's base logger, so plugins and route files keep their default types.
    loggerInstance: logger as FastifyBaseLogger,
    // No `reqId` binding: the log context adds `requestId` (and the actor) to every line written
    // during the request, also by services that log with the app logger.
    childLoggerFactory: (parent, _bindings, childOptions) => parent.child({}, childOptions),
    requestIdHeader: "x-request-id",
    // A client that stops sending must not hold a connection and its upload part forever.
    requestTimeout: 5 * 60 * 1000,
    // Behind Caddy `request.ip` would be the proxy; only private proxy addresses are trusted, so
    // X-Forwarded-For cannot be spoofed from outside.
    trustProxy: "loopback,uniquelocal",
    // One `request` line per request comes from `registerRequestLogging` instead.
    logController: new LogController({
      disableRequestLogging: true,
    }),
  });

  baseApp.setValidatorCompiler(validatorCompiler);
  baseApp.setSerializerCompiler(serializerCompiler);
  const app = baseApp.withTypeProvider<ZodTypeProvider>();

  const pool = options.pool ?? createPgPool(env.DATABASE_URL);
  const closePoolOnShutdown =
    options.closePoolOnShutdown ?? options.pool === undefined;
  const readyProbe = options.readyProbe ?? (() => checkDatabaseReadiness(pool));
  const modules = options.modules ?? defaultAppModules;
  const ownRedis =
    options.redis === undefined && env.REDIS_URL
      ? createRedisClient(env.REDIS_URL, logger, "api")
      : undefined;
  const redis = options.redis ?? ownRedis;
  const container = createAppContainer({
    config: env,
    pool,
    logger: logger as FastifyBaseLogger,
    ...(redis ? { redis } : {}),
    ...(options.publicPorts ? { publicPorts: options.publicPorts } : {}),
  });

  registerRequestLogging(app, env);
  registerSecurityPlugins(app, env, redis);
  registerAuthPlugin(app, container);
  registerRequestContextPlugin(app);
  registerCampaignContextPlugin(app, container);
  registerRequestLogActor(app);
  registerAuthorizationPlugin(app, container, { protectedPrefix: API_BASE_PATH });
  registerErrorHandler(app, env, container.ports.errorReporter ?? getErrorReporter());
  registerOpenApi(app);
  registerHealthRoutes(app, readyProbe);
  registerApiRoutes(app, container, modules, API_BASE_PATH);

  app.setNotFoundHandler(async (request, reply) => {
    return notFound(request, reply);
  });

  if (ownRedis) {
    app.addHook("onClose", async () => {
      await closeRedisClient(ownRedis);
    });
  }

  if (closePoolOnShutdown) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
