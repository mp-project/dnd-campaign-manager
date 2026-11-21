import type { FastifyBaseLogger } from "fastify";

import { getErrorReporter } from "#core/log/errorReporter";
import { installProcessLogger } from "#core/log/logContext";
import { reportError } from "#core/log/reportError";
import { shutdownTelemetry } from "#core/telemetry/lifecycle";

const FLUSH_TIMEOUT_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Shutdown took longer than ${timeoutMs} ms`)), timeoutMs);
    timer.unref();
  });

  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * An error nobody caught leaves the process in an unknown state: it is reported as `fatal`, the
 * reporter gets time to send it, `shutdown` closes what it can, and the process exits with 1.
 * For the API, the media worker and scripts alike. The logger also becomes the process logger
 * (`recordChange` outside a request).
 */
export function installProcessErrorHandlers(
  logger: FastifyBaseLogger,
  shutdown: () => Promise<void> = async () => {},
): void {
  let handled = false;

  installProcessLogger(logger);

  const handle = (kind: string) => (error: unknown) => {
    if (handled) {
      return;
    }

    handled = true;
    reportError(logger, error, `Process failed: ${kind}`, { task: "process", fatal: true });

    void getErrorReporter()
      .flush(FLUSH_TIMEOUT_MS)
      // A request still running could hold the process for minutes in an unknown state.
      .then(() => withTimeout(shutdown(), SHUTDOWN_TIMEOUT_MS))
      .catch((shutdownError: unknown) => {
        // Exiting anyway; this line is all that is left to tell.
        logger.error({ err: shutdownError }, "Shutdown after a process failure failed");
      })
      // Last, so the fatal line and whatever the shutdown logged still reach Grafana.
      .then(() => shutdownTelemetry(FLUSH_TIMEOUT_MS))
      .finally(() => process.exit(1));
  };

  process.on("unhandledRejection", handle("unhandledRejection"));
  process.on("uncaughtException", handle("uncaughtException"));
}

/** Ends a script: a failure is reported and sets exit code 1. */
export async function runScript(
  logger: FastifyBaseLogger,
  task: string,
  work: () => Promise<void>,
): Promise<void> {
  installProcessErrorHandlers(logger);

  try {
    await work();
  } catch (error) {
    reportError(logger, error, "Script failed", { task });
    process.exitCode = 1;
  } finally {
    await getErrorReporter().flush(FLUSH_TIMEOUT_MS);
  }
}
