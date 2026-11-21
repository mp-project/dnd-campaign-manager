/**
 * Sentry for the frontend, in its own chunk (`sentry.ts` loads it right after start, so it stays
 * out of the start bundle). Errors come only through `reportError` (the app's handlers decide what
 * is unexpected), so Sentry's own window handlers are left out. Log lines become breadcrumbs, and
 * Sentry Logs from `VITE_LOG_REMOTE_LEVEL`. Session Replay is added only with the consent for
 * statistics (masked text, blocked media) and stopped when it is withdrawn.
 */
import {
  addBreadcrumb,
  captureException,
  init,
  logger as sentryLogger,
  setUser,
  withScope,
  type ErrorEvent,
} from "@sentry/vue";

import type { LogContext, LogEntry } from "@/core/log";
import { scrubAddress, scrubAddresses } from "@/core/telemetry/faroPrivacy";
import { toStringContext } from "@/core/telemetry/stringContext";

type Replay = Awaited<ReturnType<typeof import("@/core/telemetry/sentryReplay").addReplay>>;

export type SentryClientSettings = {
  dsn: string;
  environment: string;
  release: string;
  replaySessionSampleRate: number;
  replayOnErrorSampleRate: number;
};

/** Sentry's own handlers of window errors and rejections would report everything twice. */
const LEFT_OUT = new Set(["GlobalHandlers", "Console"]);

const TAGS = ["source", "status", "code", "requestId"];

export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  if (event.request?.url) event.request = { url: scrubAddress(event.request.url) };
  else delete event.request;
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  if (event.breadcrumbs) event.breadcrumbs = scrubAddresses(event.breadcrumbs);
  return event;
}

export function startSentryClient(settings: SentryClientSettings) {
  init({
    dsn: settings.dsn,
    environment: settings.environment,
    release: settings.release,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    integrations: (defaults) => defaults.filter((integration) => !LEFT_OUT.has(integration.name)),
    replaysSessionSampleRate: settings.replaySessionSampleRate,
    replaysOnErrorSampleRate: settings.replayOnErrorSampleRate,
    beforeSend: scrubSentryEvent,
    beforeBreadcrumb: (breadcrumb) => scrubAddresses(breadcrumb),
  });

  let replay: Replay | null = null;
  let replayWanted = false;

  return {
    captureError(error: unknown, context: LogContext) {
      withScope((scope) => {
        const rest: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(context)) {
          if (TAGS.includes(key) && value !== undefined && value !== null) scope.setTag(key, String(value));
          else rest[key] = value;
        }
        scope.setContext("report", rest);
        captureException(error);
      });
    },
    breadcrumb(entry: LogEntry) {
      addBreadcrumb({ category: "log", level: entry.level === "warn" ? "warning" : entry.level, message: entry.message, data: entry.context });
    },
    log(entry: LogEntry) {
      sentryLogger[entry.level](entry.message, toStringContext(entry.context));
    },
    setUser(id: string | null) {
      setUser(id ? { id } : null);
    },
    startReplay() {
      replayWanted = true;
      if (replay) {
        replay.start();
        return;
      }
      void import("@/core/telemetry/sentryReplay").then(({ addReplay }) => {
        // The consent may have been withdrawn while the chunk loaded.
        if (!replay && replayWanted) replay = addReplay();
      });
    },
    stopReplay() {
      replayWanted = false;
      void replay?.stop();
    },
  };
}

export type SentryClient = ReturnType<typeof startSentryClient>;
