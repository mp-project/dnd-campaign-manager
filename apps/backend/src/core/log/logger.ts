import { trace } from "@opentelemetry/api";
import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

import type { AppEnv } from "#core/env";
import { logContextFields } from "#core/log/logContext";
import { safeError } from "#core/log/safeError";
import { createOtelLogStream } from "#core/log/otelLogStream";
import { createSentryLogStream } from "#core/log/sentryLogStream";
import { isSentryStarted, isTelemetryStarted } from "#core/telemetry/lifecycle";

export type AppLogger = Logger;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LoggerSettings = {
  /** `api`, `media-worker`, or the name of a script. */
  service: string;
  level: LogLevel | "silent";
  pretty: boolean;
  environment: string;
  /** Lowest level exported through OpenTelemetry (Grafana); null = no export. */
  exportLevel?: LogLevel | null;
  /** Lowest level sent to Sentry Logs; null = none. */
  sentryLevel?: LogLevel | null;
};

const LEVEL_ORDER: readonly (LogLevel | "silent")[] = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
];

function lowerLevel(a: LogLevel | "silent", b: LogLevel | "silent"): LogLevel | "silent" {
  return LEVEL_ORDER.indexOf(a) <= LEVEL_ORDER.indexOf(b) ? a : b;
}

/**
 * Never logged, whatever a caller passes: credentials, codes and personal data. Request bodies are
 * not logged at all; these paths are the safety net for objects that end up in a line anyway.
 * `code` is not on the list because error codes (`err.code`, `errorCode`) must stay readable.
 */
export const REDACTED_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "headers.authorization",
  "headers.cookie",
  "password",
  "*.password",
  "currentPassword",
  "*.currentPassword",
  "newPassword",
  "*.newPassword",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "verificationCode",
  "*.verificationCode",
  "secret",
  "*.secret",
] as const;

export function loggerSettingsFromEnv(env: AppEnv, service: string): LoggerSettings {
  return {
    service,
    level: env.LOG_LEVEL,
    // pino-pretty is a dev dependency, so only development may ask for it.
    pretty: env.LOG_PRETTY && env.NODE_ENV === "development",
    environment: env.NODE_ENV,
    // Only once instrumentation.ts started the SDK; scripts and tests never export.
    exportLevel: isTelemetryStarted() ? env.LOG_EXPORT_LEVEL : null,
    sentryLevel: isSentryStarted() ? env.SENTRY_LOG_LEVEL : null,
  };
}

/** Ties a line to its trace in Grafana; also on stdout, so a line found there leads to the trace. */
function traceFields(): Record<string, string> {
  const span = trace.getActiveSpan()?.spanContext();

  return span ? { trace_id: span.traceId, span_id: span.spanId } : {};
}

function mixin(): Record<string, unknown> {
  return { ...logContextFields(), ...traceFields() };
}

function loggerOptions(settings: LoggerSettings): LoggerOptions {
  return {
    level: settings.level,
    base: { service: settings.service, env: settings.environment },
    redact: { paths: [...REDACTED_LOG_PATHS], censor: "[redacted]" },
    serializers: {
      // Without the values library errors carry (query parameters, conflicting keys, recipients).
      err: (error: unknown) => pino.stdSerializers.errWithCause(safeError(error) as Error),
      error: (error: unknown) => pino.stdSerializers.errWithCause(safeError(error) as Error),
    },
    mixin,
  };
}

/**
 * The one logger factory of the backend: API, media worker, start-up tasks and scripts.
 * `destination` is for tests that read the lines.
 */
export function createLogger(settings: LoggerSettings, destination?: DestinationStream): AppLogger {
  const options = loggerOptions(settings);

  const extra: pino.StreamEntry[] = [];
  if (settings.exportLevel) extra.push({ level: settings.exportLevel, stream: createOtelLogStream() });
  if (settings.sentryLevel) extra.push({ level: settings.sentryLevel, stream: createSentryLogStream() });

  if (destination && extra.length === 0) {
    return pino(options, destination);
  }

  const stdout = destination
    ? destination
    : settings.pretty
    ? pino.transport({
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:HH:MM:ss.l",
          // The terminal shows what a developer reads; the JSON lines keep everything.
          ignore: [
            "pid,hostname,service,env,kind,ipHash,userAgent,contentLength,trace_id,span_id",
            "method,url,route,statusCode,durationMs",
          ].join(","),
          messageFormat: "{if method}{method} {url} {statusCode} {durationMs}ms {end}{msg}",
        },
      })
    : pino.destination(1);

  if (extra.length === 0) {
    return pino(options, stdout);
  }

  // stdout, Grafana and Sentry each have their own level; the logger lets through what any wants.
  const streams = settings.level === "silent" ? extra : [...extra, { level: settings.level, stream: stdout }];
  const level = streams.reduce<LogLevel | "silent">(
    (lowest, entry) => lowerLevel(lowest, entry.level as LogLevel),
    settings.level,
  );

  return pino({ ...options, level }, pino.multistream(streams));
}
