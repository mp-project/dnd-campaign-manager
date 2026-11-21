import type { Attributes } from "@opentelemetry/api";

/** Probes of the orchestration; they would fill the traces without telling anything. */
const PROBE_PATHS = new Set(["/health", "/ready"]);

export const REDACTED = "[redacted]";

export function pathWithoutQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

export function isProbe(url: string | undefined): boolean {
  return PROBE_PATHS.has(pathWithoutQuery(url ?? ""));
}

/**
 * Keeps the names of query parameters but none of their values: links from emails carry tokens,
 * codes and addresses in the query (`verify-email`, OAuth callbacks, email change). A part
 * without `=` may itself be a value (`?a@b.de`), so it is not kept either.
 */
export function redactQuery(url: string | undefined): string | undefined {
  const search = url?.split("?").slice(1).join("?");

  if (!search) {
    return undefined;
  }

  return search
    .split("&")
    .filter((part) => part.length > 0)
    .map((part) => {
      const separator = part.indexOf("=");

      return separator > 0 ? `${part.slice(0, separator)}=${REDACTED}` : REDACTED;
    })
    .join("&");
}

/**
 * Overrides what the HTTP instrumentation reads from an incoming request: no query values and
 * no addresses. The logs only carry a hashed IP; traces get none, neither the client's (from
 * forwarding headers) nor the socket's (the client itself without a proxy in front).
 */
export function incomingSpanAttributes(url: string | undefined): Attributes {
  const query = redactQuery(url);

  return {
    "client.address": REDACTED,
    "network.peer.address": REDACTED,
    "network.peer.port": 0,
    ...(query === undefined ? {} : { "url.query": query }),
  };
}
