import type { LogContext } from "@/core/log";

/** Faro's contexts and Sentry's log attributes hold plain values; objects go as JSON. */
export function toStringContext(context: LogContext): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}
