import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { type ZodTypeProvider } from "fastify-type-provider-zod";

import type { ReadyState } from "#core/db/pool";
import {
  apiBaseResponseDto,
  errorResponseDto,
  healthResponseDto,
  pingResponseDto,
  readyResponseDto,
} from "#core/http/dto";
import { createErrorPayload } from "#core/http/error-payload";

/**
 * Registers API ping endpoint used for lightweight liveness checks.
 *
 * @param app Fastify app instance.
 */
export function registerApiPingRoute(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/ping",
    {
      schema: {
        tags: ["System"],
        security: [],
        operationId: "getApiPing",
        response: {
          200: pingResponseDto,
        },
      },
    },
    async () => ({
      status: "pong" as const,
    }),
  );
}

/**
 * Registers health and readiness endpoints.
 *
 * @param app Fastify app instance.
 * @param readyProbe Readiness probe returning DB and migration state.
 */
export function registerHealthRoutes(
  app: FastifyInstance,
  readyProbe: () => Promise<ReadyState>,
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/health",
    {
      schema: {
        tags: ["System"],
        security: [],
        operationId: "getHealth",
        response: {
          200: healthResponseDto,
        },
      },
    },
    async () => ({
      status: "ok" as const,
    }),
  );

  app.withTypeProvider<ZodTypeProvider>().get(
    "/ready",
    {
      schema: {
        tags: ["System"],
        security: [],
        operationId: "getReadiness",
        response: {
          200: readyResponseDto,
          503: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const state = await readyProbe();

      if (!state.database || !state.migrations) {
        return reply.code(503).send(
          createErrorPayload({
            code: "INTERNAL_ERROR",
            message: "Database connection or migrations are not ready",
            requestId: request.id,
            details: state,
          }),
        );
      }

      return {
        status: "ready" as const,
      };
    },
  );
}

/**
 * Registers API base route metadata endpoint.
 *
 * @param app Fastify app instance.
 */
export function registerApiBaseRoute(app: FastifyInstance): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    "/",
    {
      schema: {
        tags: ["System"],
        security: [],
        operationId: "getApiBase",
        response: {
          200: apiBaseResponseDto,
        },
      },
    },
    async () => ({
      status: "ok" as const,
      basePath: "/api/v1" as const,
    }),
  );
}

/**
 * Sends a standardized not-found error payload.
 *
 * @param request Fastify request.
 * @param reply Fastify reply.
 * @param message Optional not-found message.
 * @returns Fastify reply with 404 payload.
 */
export function notFound(
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
