import cors from "@fastify/cors";
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
import { getEnv, type AppEnv } from "./core/env.js";
import { createErrorPayload } from "./core/http/error-payload.js";

type BuildAppOptions = {
  env?: AppEnv;
  pool?: Pool;
  readyProbe?: () => Promise<ReadyState>;
  staticRoot?: string;
};

const SPA_FALLBACK_EXCLUDES = ["/api", "/documentation", "/health", "/ready"];
const backendSourceDir = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticRoot = path.resolve(backendSourceDir, "../../frontend/dist");

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
  const closePoolOnShutdown = options.pool === undefined;
  const readyProbe = options.readyProbe ?? (() => checkDatabaseReadiness(pool));
  const staticRoot = options.staticRoot ?? defaultStaticRoot;
  const indexHtmlPath = path.join(staticRoot, "index.html");

  app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
  });

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

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

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

  app.get("/api/v1", async () => ({
    status: "ok",
    basePath: "/api/v1",
  }));

  app.register(
    async (scopedApp) => {
      scopedApp.get("/ping", async () => ({
        status: "pong",
      }));
    },
    { prefix: "/api/v1" },
  );

  if (existsSync(staticRoot)) {
    app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      index: ["index.html"],
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (
      existsSync(indexHtmlPath) &&
      shouldServeSpaFallback(request.url, request.headers.accept)
    ) {
      return reply.type("text/html; charset=utf-8").sendFile("/index.html");
    }

    return notFound(request, reply);
  });

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

  if (closePoolOnShutdown) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
