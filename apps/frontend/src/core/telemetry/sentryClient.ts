/**
 * Sentry for the frontend, in its own chunk (`sentry.ts` loads it right after start, so it stays
 * out of the start bundle). Errors come only through `reportError` (the app's handlers decide what
 * is unexpected), so Sentry's own window handlers are left out. Log lines become breadcrumbs, and
 * Sentry Logs from `VITE_LOG_REMOTE_LEVEL`. Session Replay is added only with the consent for
 * statistics (masked text, blocked media, sampled by `VITE_SENTRY_REPLAY_*`) and stopped when it is
 * withdrawn.
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
import { scrubAddress, scrubAddresses } from "@/core/telemetry/addressPrivacy";
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

/**
 * Keeps only the scrubbed address and the user id of the request; addresses anywhere else (tags,
 * contexts, breadcrumbs, exception messages) lose query, fragment and slug.
 */
export function scrubSentryEvent<T extends ErrorEvent>(event: T): T {
  if (event.request?.url) event.request = { url: scrubAddress(event.request.url) };
  else delete event.request;
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };
  if (event.breadcrumbs) event.breadcrumbs = scrubAddresses(event.breadcrumbs);
  if (event.tags) event.tags = scrubAddresses(event.tags);
  if (event.contexts) event.contexts = scrubAddresses(event.contexts);
  if (event.extra) event.extra = scrubAddresses(event.extra);
  for (const value of event.exception?.values ?? []) {
    if (value.value) value.value = scrubMessage(value.value);
  }
  return event;
}

/** Addresses inside a text (an error message naming a URL). */
function scrubMessage(text: string): string {
  return text.replace(/(https?:\/\/|\/)[^\s"'<>]*/g, (address) => scrubAddress(address));
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
    beforeSendLog: (log) => ({
      ...log,
      message: scrubMessage(String(log.message)),
      ...(log.attributes ? { attributes: scrubAddresses(log.attributes) } : {}),
    }),
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
      // A withdrawal reloads the page, so a replay is only ever added once per page.
      if (replay) return;
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
