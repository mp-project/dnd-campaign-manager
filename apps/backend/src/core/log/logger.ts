import type { FastifyBaseLogger, FastifyRequest } from "fastify";

import type { AppEnv } from "#core/env";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

type LogContext = Record<string, unknown>;

function isTestRuntime(env: AppEnv): boolean {
  return env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
}

/**
 * Writes a log entry with explicit level and optional structured context.
 */
export function logWithLevel(
  logger: FastifyBaseLogger,
  level: LogLevel,
  message: string,
  context?: LogContext,
): void {
  if (context && Object.keys(context).length > 0) {
    logger[level](context, message);
    return;
  }

  logger[level](message);
}

/**
 * Logs unhandled request errors unless test runtime suppresses noisy output.
 */
export function logUnhandledRequestError(
  env: AppEnv,
  request: FastifyRequest,
  error: unknown,
): void {
  if (isTestRuntime(env)) {
    return;
  }

  logWithLevel(request.log, "error", "Unhandled request error", { err: error });
}

/**
 * Logs process/runtime level failures with a consistent error envelope.
 */
export function logRuntimeError(
  logger: FastifyBaseLogger,
  message: string,
  error: unknown,
): void {
  logWithLevel(logger, "error", message, { err: error });
}
