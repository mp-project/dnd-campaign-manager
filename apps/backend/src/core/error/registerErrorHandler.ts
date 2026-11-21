import type { FastifyInstance } from "fastify";

import type { AppEnv } from "#core/env";
import { mapErrorToHttp } from "#core/error/errorMapper";
import { createErrorPayload } from "#core/error/errorPayload";
import type { ErrorReporter } from "#core/log/errorReporter";
import { reportError } from "#core/log/reportError";
import { markResponseError } from "#core/log/requestLog";
import { markRequestSpan } from "#core/telemetry/requestSpan";

/**
 * The one place where request errors are handled:
 * - expected errors (4xx) get no line of their own; the `request` line carries their code,
 * - an overloaded database (503) is a warning; alerts come from how often it happens,
 * - everything else (5xx, unknown errors) is logged with stack and cause and reported.
 */
export function registerErrorHandler(
  app: FastifyInstance,
  env: AppEnv,
  reporter: ErrorReporter,
): void {
  app.setErrorHandler((error, request, reply) => {
    const mappedError = mapErrorToHttp(error);
    const route = request.routeOptions.url;

    markResponseError(request, mappedError.code);
    markRequestSpan(request, error, mappedError.statusCode);

    if (mappedError.code === "SERVICE_UNAVAILABLE") {
      request.log.warn({ err: error, route }, "Service unavailable");
    } else if (mappedError.statusCode >= 500) {
      reportError(
        request.log,
        error,
        "Request failed",
        {
          requestId: request.id,
          ...(route ? { route } : {}),
          userId: request.requestContext?.actorId ?? null,
          campaignId: request.campaignContext?.campaignId ?? null,
          errorCode: mappedError.code,
        },
        reporter,
      );
    }

    const retryAfterSeconds = (mappedError.details as { retryAfterSeconds?: unknown } | null | undefined)
      ?.retryAfterSeconds;

    if (mappedError.code === "RATE_LIMITED" && typeof retryAfterSeconds === "number") {
      reply.header("retry-after", retryAfterSeconds);
    }

    const isInternalError = mappedError.code === "INTERNAL_ERROR";
    const shouldMaskInternalError =
      (env.NODE_ENV === "production" || env.NODE_ENV === "stage") &&
      isInternalError;

    reply.code(mappedError.statusCode).send(
      createErrorPayload({
        code: shouldMaskInternalError ? "INTERNAL_ERROR" : mappedError.code,
        message: shouldMaskInternalError
          ? "Internal server error"
          : mappedError.message,
        details: shouldMaskInternalError ? null : mappedError.details,
        requestId: request.id,
      }),
    );
  });
}
