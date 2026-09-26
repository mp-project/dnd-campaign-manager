import type { FastifyInstance } from "fastify";

import type { AppEnv } from "#core/env";
import { mapErrorToHttp } from "#core/error/errorMapper";
import { createErrorPayload } from "#core/error/errorPayload";
import { logUnhandledRequestError } from "#core/log/logger";

export function registerErrorHandler(app: FastifyInstance, env: AppEnv): void {
  app.setErrorHandler((error, request, reply) => {
    const mappedError = mapErrorToHttp(error);
    logUnhandledRequestError(env, request, error);

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
