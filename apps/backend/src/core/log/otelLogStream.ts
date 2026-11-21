import { logs, SeverityNumber, type Attributes, type Logger } from "@opentelemetry/api";
import type { DestinationStream } from "pino";

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

type PinoLine = Record<string, unknown> & { level?: unknown; time?: unknown };

function isAttributeValue(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * `LOG_CHANGE_VALUES` puts the new values of a change (names, note text …) into the `change`
 * line to spot wrong data early. That stays on our own stdout; Grafana gets ids and field names.
 * Returns the line to export.
 */
function withoutChangeValues(parsed: PinoLine, line: string): string {
  if (!Array.isArray(parsed.entities)) {
    return line.trimEnd();
  }

  let removed = false;

  for (const entity of parsed.entities as unknown[]) {
    if (entity && typeof entity === "object" && "values" in entity) {
      delete (entity as Record<string, unknown>).values;
      removed = true;
    }
  }

  return removed ? JSON.stringify(parsed) : line.trimEnd();
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
