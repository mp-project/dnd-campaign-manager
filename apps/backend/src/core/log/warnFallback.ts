import { contextLogger } from "#core/log/logContext";

/**
 * For a documented fallback in code without a logger of its own (a stored definition that no
 * longer parses is skipped, a cleanup that may fail): the error is not thrown, but it is not
 * silent either. Writes a `warn` with the error to the request's (or the process's) logger.
 */
export function warnFallback(error: unknown, message: string, fields: Record<string, unknown> = {}): void {
  contextLogger()?.warn({ err: error, ...fields }, message);
}
