const LOCK_NOT_AVAILABLE_CODE = "55P03";
const POOL_TIMEOUT_MESSAGES = [
  "timeout exceeded when trying to connect",
  "Connection terminated due to connection timeout",
];

/**
 * Detects `lock_timeout` and connection pool timeouts, also when wrapped as an error `cause`.
 *
 * @param error Unknown runtime error.
 * @returns True when the database was too busy to answer in time.
 */
export function isDatabaseBusyError(error: unknown): boolean {
  let current = error;

  while (typeof current === "object" && current !== null) {
    const { code, message, cause } = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };

    if (
      code === LOCK_NOT_AVAILABLE_CODE ||
      (typeof message === "string" && POOL_TIMEOUT_MESSAGES.includes(message))
    ) {
      return true;
    }

    current = cause;
  }

  return false;
}
