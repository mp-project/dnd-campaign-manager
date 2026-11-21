/**
 * Sentry error reporting runs for everybody (no storage in the browser, needed to keep the app
 * working); only Session Replay waits for the consent for statistics. The SDK loads as its own
 * chunk right after start: errors reported before it arrived are kept (a few) and sent then.
 * Without `VITE_SENTRY_DSN`, and in a controlled browser (prerendering, end-to-end tests), nothing
 * loads. Users are sent by their id only.
 */
import { hashKey, type QueryClient } from "@tanstack/vue-query";

import { type Me, meQuery } from "@/core/auth/session";
import { onStatisticsConsent, onStatisticsDeclined } from "@/core/consent/consent";
import { addErrorReporter, addLogSink, logger, type LogContext, type LogLevel } from "@/core/log";
import { remoteLogLevel } from "@/core/telemetry/faro";
import type { SentryClient } from "@/core/telemetry/sentryClient";

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];
const MAX_EARLY_ERRORS = 20;

function sampleRate(value: string | undefined, fallback: number): number {
  const rate = Number(value);
  return value !== undefined && value !== "" && rate >= 0 && rate <= 1 ? rate : fallback;
}

export function sentryDsn(): string {
  return import.meta.env.VITE_SENTRY_DSN?.trim() ?? "";
}

export function installSentry(queryClient: QueryClient): void {
  const dsn = sentryDsn();
  if (!dsn || (typeof navigator !== "undefined" && navigator.webdriver === true)) return;

  let client: SentryClient | null = null;
  let replayWanted = false;
  let userId: string | null = null;
  const early: [unknown, LogContext][] = [];
  const minimum = LEVEL_ORDER.indexOf(remoteLogLevel(import.meta.env.VITE_LOG_REMOTE_LEVEL));

  addErrorReporter((error, context) => {
    if (client) client.captureError(error, context);
    else if (early.length < MAX_EARLY_ERRORS) early.push([error, context]);
  });
  addLogSink((entry) => {
    client?.breadcrumb(entry);
    if (LEVEL_ORDER.indexOf(entry.level) >= minimum) client?.log(entry);
  });

  const meHash = hashKey(meQuery.queryKey);
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash !== meHash) return;
    if (event.type === "removed") userId = null;
    else if (event.type === "updated") userId = (event.query.state.data as Me | undefined)?.id ?? null;
    else return;
    client?.setUser(userId);
  });

  // Session Replay's session key (@sentry/replay); a decline removes it.
  onStatisticsDeclined(() => {
    try {
      window.sessionStorage.removeItem("sentryReplaySession");
    } catch {
      // Blocked storage: nothing could have been stored.
    }
  });
  onStatisticsConsent((granted) => {
    replayWanted = granted;
    // A withdrawal reloads the page (`consent`); the replay stops until then.
    if (granted) client?.startReplay();
    else client?.stopReplay();
  });

  void import("@/core/telemetry/sentryClient")
    .then(({ startSentryClient }) => {
      client = startSentryClient({
        dsn,
        environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
        release: import.meta.env.VITE_APP_RELEASE || "dev",
        replaySessionSampleRate: sampleRate(import.meta.env.VITE_SENTRY_REPLAY_SAMPLE_RATE, 0.1),
        replayOnErrorSampleRate: sampleRate(import.meta.env.VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE, 1),
      });
      client.setUser(userId);
      if (replayWanted) client.startReplay();
      for (const [error, context] of early.splice(0)) client.captureError(error, context);
    })
    .catch((error: unknown) => {
      // A blocked or outdated chunk: errors are still logged, just not reported.
      logger.warn("Sentry could not be loaded", { task: "sentry", message: String(error) });
    });
}
