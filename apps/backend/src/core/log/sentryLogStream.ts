import { logger as sentryLogger } from "@sentry/core";
import type { DestinationStream } from "pino";

import { type PinoLine, withoutChangeValues } from "#core/log/exportLine";

type SentryLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_BY_PINO: Record<number, SentryLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const OMITTED = new Set(["level", "time", "msg", "pid", "hostname"]);

type Attribute = string | number | boolean;

/**
 * The Sentry log entry for one pino line: its message and every field as an attribute (nested
 * ones as JSON). The line is already redacted; change values are left out as for Grafana.
 */
export function toSentryLog(line: string): { level: SentryLevel; message: string; attributes: Record<string, Attribute> } {
  const parsed = JSON.parse(line) as PinoLine;
  withoutChangeValues(parsed, line);
  const attributes: Record<string, Attribute> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (OMITTED.has(key) || value === undefined || value === null) continue;
    attributes[key] =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? value
        : JSON.stringify(value);
  }

  return {
    level: LEVEL_BY_PINO[typeof parsed.level === "number" ? parsed.level : 30] ?? "info",
    message: typeof parsed.msg === "string" ? parsed.msg : "",
    attributes,
  };
}

/**
 * A pino destination for Sentry Logs, so an issue shows the lines written before it. Only added
 * once Sentry was started (`instrumentation.ts`), from `SENTRY_LOG_LEVEL`.
 */
export function createSentryLogStream(target: typeof sentryLogger = sentryLogger): DestinationStream {
  return {
    write(line: string) {
      const { level, message, attributes } = toSentryLog(line);
      target[level](message, attributes);
    },
  };
}
