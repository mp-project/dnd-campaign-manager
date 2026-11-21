/**
 * Grafana Faro itself, in its own chunk: `faro.ts` imports it only after consent, so visitors
 * without consent never download it. Page views, web vitals, user actions, fetch timings and
 * traces (with `traceparent` to the API, so a click leads to the backend's trace), errors of the
 * window and the app's logs from `VITE_LOG_REMOTE_LEVEL`.
 */
import {
  getWebInstrumentations,
  initializeFaro,
  LogLevel,
  STORAGE_KEY,
  type Faro,
  type TransportItem,
} from "@grafana/faro-web-sdk";
import { TracingInstrumentation } from "@grafana/faro-web-tracing";

import { apiOrigin } from "@/core/api/client";
import type { LogContext, LogEntry, LogLevel as AppLogLevel } from "@/core/log";
import { scrubAddresses } from "@/core/telemetry/faroPrivacy";

const FARO_LEVEL: Record<AppLogLevel, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

/** Faro's context holds strings only. */
export function toFaroContext(context: LogContext): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The API's origin, when it is another one than the app's (production: `api.<domain>`). */
function crossOriginApi(): RegExp[] {
  const base = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
  if (!/^https?:\/\//.test(base)) return [];
  return [new RegExp(`^${escapeRegExp(apiOrigin(base))}/`)];
}

export type FaroClient = {
  faro: Faro;
  sendLog(entry: LogEntry): void;
  sendError(error: unknown, context: LogContext): void;
};

export function createFaroClient(options: { url: string; environment: string; version: string }): FaroClient {
  const faro = initializeFaro({
    url: options.url,
    app: { name: "questaria-frontend", namespace: "questaria", environment: options.environment, version: options.version },
    instrumentations: [
      // The app's logger sends its lines itself; console output stays local.
      ...getWebInstrumentations({ captureConsole: false }),
      new TracingInstrumentation({
        instrumentationOptions: { propagateTraceHeaderCorsUrls: crossOriginApi() },
      }),
    ],
    // One session across tabs, kept for returning visitors (allowed with the consent).
    sessionTracking: { persistent: true },
    trackGeolocation: false,
    preventGlobalExposure: true,
    beforeSend: (item: TransportItem) => scrubAddresses(item),
  });

  return {
    faro,
    sendLog(entry) {
      faro.api.pushLog([entry.message], { level: FARO_LEVEL[entry.level], context: toFaroContext(entry.context) });
    },
    sendError(error, context) {
      const value = error instanceof Error ? error : new Error(String(error));
      faro.api.pushError(value, { context: toFaroContext(context) });
    },
  };
}

/** Removes what Faro stored in the browser (withdrawn consent). */
export function forgetFaroSession(): void {
  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // Storage blocked: then nothing could have been stored either.
    }
  }
}
