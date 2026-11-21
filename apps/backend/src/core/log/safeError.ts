/**
 * Errors of libraries can carry data in their message and fields: drizzle's `DrizzleQueryError`
 * names the query's parameter values (email addresses, hashes, note text), PostgreSQL's `detail`
 * repeats conflicting values (`Key (email)=(…) already exists`), nodemailer names recipients and
 * the server's answer. `safeError` returns a copy of the error and its causes without those values,
 * for everything that leaves the error handling: log lines (pino's `err` serializer), Sentry and
 * span exceptions. Codes, names, SQL text and stacks stay.
 */
const MAX_CAUSES = 8;

/** PostgreSQL error fields that are safe: codes and names, never values. */
const PG_SAFE_FIELDS = ["code", "severity", "routine", "schema", "table", "column", "constraint", "dataType"] as const;
/** Nodemailer error fields that are safe. */
const SMTP_SAFE_FIELDS = ["code", "command", "responseCode"] as const;

type Fields = Record<string, unknown>;

function isDrizzleQueryError(error: Error & Fields): boolean {
  return typeof error.query === "string" && "params" in error;
}

function isPgError(error: Error & Fields): boolean {
  return typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code) && "severity" in error;
}

function isSmtpError(error: Error & Fields): boolean {
  return "responseCode" in error || "rejected" in error || "envelope" in error || error.code === "EENVELOPE";
}

function withMessage(original: Error, message: string, name = original.name): Error & Fields {
  const copy = new Error(message) as Error & Fields;
  copy.name = name;
  const frames = original.stack?.indexOf("\n    at ") ?? -1;
  copy.stack = frames >= 0 ? `${name}: ${message}${original.stack!.slice(frames)}` : `${name}: ${message}`;
  return copy;
}

function pick(source: Fields, target: Fields, fields: readonly string[]): void {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = source[field];
  }
}

export function safeError(error: unknown, depth = 0): unknown {
  if (!(error instanceof Error) || depth > MAX_CAUSES) return error;
  const source = error as Error & Fields;
  let copy: Error & Fields;

  if (isDrizzleQueryError(source)) {
    copy = withMessage(source, `Failed query: ${String(source.query)}`, "DrizzleQueryError");
  } else if (isPgError(source)) {
    copy = withMessage(source, `PostgreSQL error ${String(source.code)}`, "DatabaseError");
    pick(source, copy, PG_SAFE_FIELDS);
  } else if (isSmtpError(source)) {
    copy = withMessage(source, `SMTP error ${String(source.code ?? "")} ${String(source.responseCode ?? "")}`.trim());
    pick(source, copy, SMTP_SAFE_FIELDS);
  } else {
    // The app's own errors: message and fields are written by us and carry no values.
    copy = Object.assign(withMessage(source, source.message), source);
  }

  if (source.cause !== undefined) copy.cause = safeError(source.cause, depth + 1);
  return copy;
}
