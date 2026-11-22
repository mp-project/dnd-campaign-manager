/** One pino line as written to stdout, parsed. */
export type PinoLine = Record<string, unknown> & { level?: unknown; time?: unknown; msg?: unknown };

/**
 * `LOG_CHANGE_VALUES` puts the new values of a change (names, note text …) into the `change`
 * line to spot wrong data early. That stays on our own stdout; services outside (Grafana, Sentry)
 * get ids and field names. Removes the values from `parsed` and returns the line to export.
 */
export function withoutChangeValues(parsed: PinoLine, line: string): string {
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
