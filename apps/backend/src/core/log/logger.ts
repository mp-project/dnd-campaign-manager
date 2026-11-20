import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

import type { AppEnv } from "#core/env";
import { logContextFields } from "#core/log/logContext";

export type AppLogger = Logger;

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type LoggerSettings = {
  /** `api`, `media-worker`, or the name of a script. */
  service: string;
  level: LogLevel | "silent";
  pretty: boolean;
  environment: string;
};

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
  };
}

function loggerOptions(settings: LoggerSettings): LoggerOptions {
  return {
    level: settings.level,
    base: { service: settings.service, env: settings.environment },
    redact: { paths: [...REDACTED_LOG_PATHS], censor: "[redacted]" },
    serializers: {
      err: pino.stdSerializers.errWithCause,
      error: pino.stdSerializers.errWithCause,
    },
    mixin: logContextFields,
  };
}

/**
 * The one logger factory of the backend: API, media worker, start-up tasks and scripts.
 * `destination` is for tests that read the lines.
 */
export function createLogger(settings: LoggerSettings, destination?: DestinationStream): AppLogger {
  const options = loggerOptions(settings);

  if (destination) {
    return pino(options, destination);
  }

  if (settings.pretty) {
    return pino({
      ...options,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:HH:MM:ss.l",
          // The terminal shows what a developer reads; the JSON lines keep everything.
          ignore: [
            "pid,hostname,service,env,kind,ipHash,userAgent,contentLength",
            "method,url,route,statusCode,durationMs",
          ].join(","),
          messageFormat: "{if method}{method} {url} {statusCode} {durationMs}ms {end}{msg}",
        },
      },
    });
  }

  return pino(options);
}
