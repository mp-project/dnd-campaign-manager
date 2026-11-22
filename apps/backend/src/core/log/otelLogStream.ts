import { logs, SeverityNumber, type Attributes, type Logger } from "@opentelemetry/api";
import type { DestinationStream } from "pino";

import { type PinoLine, withoutChangeValues } from "#core/log/exportLine";

const SEVERITY_BY_PINO_LEVEL: Record<number, [SeverityNumber, string]> = {
  10: [SeverityNumber.TRACE, "TRACE"],
  20: [SeverityNumber.DEBUG, "DEBUG"],
  30: [SeverityNumber.INFO, "INFO"],
  40: [SeverityNumber.WARN, "WARN"],
  50: [SeverityNumber.ERROR, "ERROR"],
  60: [SeverityNumber.FATAL, "FATAL"],
};

/**
 * Fields copied into the record's attributes (Loki structured metadata), so the most common
 * filters work without parsing the line. Ids and codes only; the full line stays in the body.
 */
const ATTRIBUTE_FIELDS = [
  "msg",
  "kind",
  "requestId",
  "userId",
  "campaignId",
  "task",
  "route",
  "method",
  "statusCode",
  "errorCode",
  "action",
] as const;


function isAttributeValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/** The OpenTelemetry log record for one pino line; exported for tests. */
export function toOtelLogRecord(line: string) {
  const parsed = JSON.parse(line) as PinoLine;
  const body = withoutChangeValues(parsed, line);
  const [severityNumber, severityText] =
    SEVERITY_BY_PINO_LEVEL[typeof parsed.level === "number" ? parsed.level : 30] ??
    SEVERITY_BY_PINO_LEVEL[30]!;
  const attributes: Attributes = {};

  for (const field of ATTRIBUTE_FIELDS) {
    const value = parsed[field];

    if (isAttributeValue(value)) {
      attributes[field] = value;
    }
  }

  return {
    timestamp: typeof parsed.time === "number" ? parsed.time : Date.now(),
    severityNumber,
    severityText,
    // The line as written to stdout (already redacted, change values left out): `| json` in Loki
    // reads every field.
    body,
    attributes,
  };
}

/**
 * A pino destination that hands every line to the OpenTelemetry SDK, which batches and exports
 * them (Grafana Loki). pino writes synchronously inside the log call, so the record picks up the
 * active span and carries `trace_id`/`span_id` without extra fields.
 */
export function createOtelLogStream(logger: Logger = logs.getLogger("questaria")): DestinationStream {
  return {
    write(line: string) {
      logger.emit(toOtelLogRecord(line));
    },
  };
}
