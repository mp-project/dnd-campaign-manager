import { isApiError } from "@/core/api/errors";
import { logger, type LogContext } from "@/core/log/logger";

/**
 * - `expected`: answers the page shows as a translated message (validation, rights, not found,
 *   conflicts, limits). Nothing to report.
 * - `network`: no answer at all (offline, server down); usually the user's connection.
 * - `unexpected`: 5xx, answers without the error envelope and every other error. Reported.
 */
export type ErrorKind = "expected" | "network" | "unexpected";

export function classifyError(error: unknown): ErrorKind {
  if (!isApiError(error)) {
    return "unexpected";
  }
  if (error.code === "NETWORK_ERROR") {
    return "network";
  }
  if (error.code === "UNKNOWN_ERROR" || error.status >= 500) {
    return "unexpected";
  }
  return "expected";
}

export type ErrorReporter = (error: unknown, context: LogContext) => void;

const reporters = new Set<ErrorReporter>();

/** Where unexpected errors go besides the log (Sentry, once it is set up). */
export function addErrorReporter(reporter: ErrorReporter): () => void {
  reporters.add(reporter);
  return () => reporters.delete(reporter);
}

function describe(error: unknown): LogContext {
  if (isApiError(error)) {
    return { status: error.status, code: error.code, requestId: error.requestId };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { value: String(error) };
}

/**
 * The one place errors are handled centrally. Pages still show their own reaction (toast, inline
 * error, editor stays open); this only decides what is logged and reported. The `requestId` of an
 * API error links the report to the backend's log line.
 */
export function reportError(error: unknown, context: LogContext = {}): ErrorKind {
  const kind = classifyError(error);
  const details = { ...context, ...describe(error) };

  if (kind === "expected") {
    logger.debug("Expected error", details);
    return kind;
  }

  if (kind === "network") {
    logger.info("Network error", details);
    return kind;
  }

  logger.error("Unexpected error", { ...details, error });

  for (const reporter of reporters) {
    try {
      reporter(error, details);
    } catch {
      // Reporting must never raise a second error.
    }
  }

  return kind;
}
