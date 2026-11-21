/**
 * The one logger of the frontend. In development every line goes to the console; outside it only
 * to the sinks that are installed (Sentry breadcrumbs and logs, Faro after consent; see
 * `@/core/telemetry`). Context carries ids and codes, never typed text or personal data.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

export type LogEntry = { level: LogLevel; message: string; context: LogContext };

export type LogSink = (entry: LogEntry) => void;

const sinks = new Set<LogSink>();

/** Adds a destination for every log line; returns the function that removes it again. */
export function addLogSink(sink: LogSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  if (import.meta.env.DEV) {
    // The only place in the app that writes to the console (exempt from `no-console`).
    console[level === "debug" ? "debug" : level](message, context);
  }

  for (const sink of sinks) {
    try {
      sink({ level, message, context });
    } catch {
      // A broken destination must never break the app or the other destinations.
    }
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
