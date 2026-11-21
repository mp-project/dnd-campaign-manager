import type { FastifyBaseLogger } from "fastify";

import {
  getErrorReporter,
  type ErrorReportContext,
  type ErrorReporter,
} from "#core/log/errorReporter";
import { contextLogger, currentLogContext } from "#core/log/logContext";

/**
 * The one way to handle an unexpected error outside the request error handler (worker jobs,
 * start-up tasks, event handlers, scripts, the process itself): logs it with stack and cause and
 * reports it. The caller decides what happens next (retry, skip, exit).
 */
export function reportError(
  logger: FastifyBaseLogger,
  error: unknown,
  message: string,
  context: ErrorReportContext = {},
  reporter: ErrorReporter = getErrorReporter(),
): void {
  const { fatal, ...fields } = context;

  logger[fatal ? "fatal" : "error"]({ err: error, ...fields }, message);

  const logContext = currentLogContext();

  reporter.capture(error, {
    ...(logContext?.requestId ? { requestId: logContext.requestId } : {}),
    ...(logContext?.userId ? { userId: logContext.userId } : {}),
    ...(logContext?.campaignId ? { campaignId: logContext.campaignId } : {}),
    ...(logContext?.task ? { task: logContext.task } : {}),
    ...context,
  });
}

/**
 * `reportError` for code without a logger of its own: uses the request's (or the process's)
 * logger. For an unexpected error that is handled on purpose, e.g. an answer that must stay the
 * same whether or not a mail could be sent.
 */
export function reportErrorInContext(
  error: unknown,
  message: string,
  context: ErrorReportContext = {},
): void {
  const logger = contextLogger();

  if (logger) {
    reportError(logger, error, message, context);
  } else {
    getErrorReporter().capture(error, context);
  }
}
