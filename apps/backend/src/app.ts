import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

import {
  checkDatabaseReadiness,
  createPgPool,
  type ReadyState,
} from "./core/db/pool.js";
import {
  createAppContainer,
  type AppPublicPorts,
} from "./core/app/container.js";
import {
  resolveModuleRegistrationOrder,
  type AppModule,
} from "./core/app/module-system.js";
import { getEnv, type AppEnv } from "./core/env.js";
import { createErrorPayload } from "./core/http/error-payload.js";
import type { RequestContext } from "./core/http/request-context.js";

type BuildAppOptions = {
  env?: AppEnv;
  pool?: Pool;
  readyProbe?: () => Promise<ReadyState>;
  staticRoot?: string;
  modules?: readonly AppModule[];
  publicPorts?: AppPublicPorts;
  closePoolOnShutdown?: boolean;
};

const SPA_FALLBACK_EXCLUDES = ["/api", "/documentation", "/health", "/ready"];
const backendSourceDir = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticRoot = path.resolve(backendSourceDir, "../../frontend/dist");

const defaultAppModules: readonly AppModule[] = [
  {
    name: "system",
    dependencies: [],
    register: async (app) => {
      app.get("/ping", async () => ({
        status: "pong",
      }));
    },
  },
];

function shouldServeSpaFallback(
  url: string,
  acceptHeader: string | undefined,
): boolean {
  if (!acceptHeader?.includes("text/html")) {
    return false;
  }

  const pathname = url.split("?")[0] ?? "/";

  return !SPA_FALLBACK_EXCLUDES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function notFound(
  request: FastifyRequest,
  reply: FastifyReply,
  message: string = "Route not found",
): FastifyReply {
  return reply.code(404).send(
    createErrorPayload({
      code: "NOT_FOUND",
      message,
      requestId: request.id,
    }),
  );
}

function registerSecurityPlugins(app: FastifyInstance, env: AppEnv): void {
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
  });
}

function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest("authToken", null);

  app.addHook("onRequest", async (request) => {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      request.authToken = null;
      return;
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();
    request.authToken = token.length > 0 ? token : null;
  });
}

function registerRequestContextPlugin(app: FastifyInstance): void {
  app.decorateRequest("requestContext", null as unknown as RequestContext);

  app.addHook("preHandler", async (request) => {
    if (request.authToken === "system-admin") {
      request.requestContext = {
        actorId: "system-admin",
        systemRole: "ADMIN",
      };
      return;
    }

    request.requestContext = {
      actorId: request.authToken,
      systemRole: "USER",
    };
  });
}

function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    const candidateStatusCode =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;

    const statusCode = candidateStatusCode >= 400 ? candidateStatusCode : 500;
    const errorMessage =
      error instanceof Error ? error.message : "Request failed";

    reply.code(statusCode).send(
      createErrorPayload({
        code: statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message: statusCode === 500 ? "Internal server error" : errorMessage,
        requestId: request.id,
      }),
    );
  });
}

function registerOpenApi(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      info: {
        title: "DnD Campaign Manager API",
        version: "0.1.0",
      },
    },
  });

  app.register(swaggerUI, {
    routePrefix: "/documentation",
  });
}

function registerHealthRoutes(
  app: FastifyInstance,
  readyProbe: () => Promise<ReadyState>,
): void {
  app.get("/health", async () => ({
    status: "ok",
  }));

  app.get("/ready", async (request, reply) => {
    const state = await readyProbe();

    if (!state.database || !state.migrations) {
      return reply.code(503).send(
        createErrorPayload({
          code: "NOT_READY",
          message: "Database connection or migrations are not ready",
          requestId: request.id,
          details: state,
        }),
      );
    }

    return {
      status: "ready",
    };
  });
}

function registerApiRoutes(
  app: FastifyInstance,
  modules: readonly AppModule[],
  container: ReturnType<typeof createAppContainer>,
): void {
  app.register(
    async (apiApp) => {
      apiApp.get("/", async () => ({
        status: "ok",
        basePath: "/api/v1",
      }));

      for (const module of modules) {
        await module.register(apiApp, container);
      }
    },
    { prefix: "/api/v1" },
  );
}

function registerStaticFrontend(app: FastifyInstance, staticRoot: string): void {
  if (!existsSync(staticRoot)) {
    return;
  }

  app.register(fastifyStatic, {
    root: staticRoot,
    prefix: "/",
    index: ["index.html"],
  });
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? getEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    requestIdHeader: "x-request-id",
    logController: new LogController({
      disableRequestLogging: true,
    }),
  });

  const pool = options.pool ?? createPgPool(env.DATABASE_URL);
  const closePoolOnShutdown = options.closePoolOnShutdown ?? options.pool === undefined;
  const readyProbe = options.readyProbe ?? (() => checkDatabaseReadiness(pool));
  const staticRoot = options.staticRoot ?? defaultStaticRoot;
  const indexHtmlPath = path.join(staticRoot, "index.html");
  const modules = resolveModuleRegistrationOrder(options.modules ?? defaultAppModules);
  const container = createAppContainer(
    options.publicPorts
      ? {
          config: env,
          pool,
          publicPorts: options.publicPorts,
        }
      : {
          config: env,
          pool,
        },
  );

  registerSecurityPlugins(app, env);
  registerAuthPlugin(app);
  registerRequestContextPlugin(app);
  registerErrorHandler(app);
  registerOpenApi(app);
  registerHealthRoutes(app, readyProbe);
  registerApiRoutes(app, modules, container);
  registerStaticFrontend(app, staticRoot);

  app.setNotFoundHandler(async (request, reply) => {
    if (
      existsSync(indexHtmlPath) &&
      shouldServeSpaFallback(request.url, request.headers.accept)
    ) {
      return reply.type("text/html; charset=utf-8").sendFile("/index.html");
    }

    return notFound(request, reply);
  });

  if (closePoolOnShutdown) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
