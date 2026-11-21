import { warnFallback } from "#core/log/warnFallback";

/**
 * State of the OpenTelemetry SDK for the rest of the backend, without importing the SDK: the
 * logger asks whether to export, the API and the worker flush on shutdown. `instrumentation.ts`
 * starts the SDK before the app is imported; without it (scripts, tests, no endpoint configured)
 * telemetry is off and nothing leaves the process.
 */
type TelemetryHandle = {
  shutdown(): Promise<void>;
};

let handle: TelemetryHandle | undefined;
let inFlight: Promise<boolean> | undefined;

export function markTelemetryStarted(started: TelemetryHandle): void {
  handle = started;
  inFlight = undefined;
}

export function isTelemetryStarted(): boolean {
  return handle !== undefined;
}

const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Sends what is still queued (spans, metrics, log records) and stops the SDK. Resolves false
 * when the time ran out or sending failed; stopping must never keep a process from exiting.
 * Callers that come while a flush runs (SIGTERM during a fatal error, or the other way round)
 * wait for the same flush instead of exiting before it ends.
 */
export function shutdownTelemetry(timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<boolean> {
  if (inFlight) {
    return inFlight;
  }

  const current = handle;

  if (!current) {
    return Promise.resolve(true);
  }

  handle = undefined;
  inFlight = flush(current, timeoutMs);

  return inFlight;
}

async function flush(current: TelemetryHandle, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref();
  });

  try {
    const flushed = await Promise.race([current.shutdown().then(() => true as const), timeout]);

    if (!flushed) {
      // The collector is too slow: what is still queued is lost, the process exits anyway.
      warnFallback(new Error(`No answer within ${timeoutMs} ms`), "Telemetry flush timed out");
    }

    return flushed;
  } catch (error) {
    // Collector unreachable at shutdown: what was queued is lost, the process still exits.
    warnFallback(error, "Telemetry could not be flushed at shutdown");
    return false;
  } finally {
    clearTimeout(timer);
  }
}
