/**
 * Sentry for the backend: unexpected errors (through the `ErrorReporter` port, so the central
 * error handler, `reportError` and the process handlers stay the only places that decide what is
 * reported) and the log lines from `SENTRY_LOG_LEVEL`. Tracing stays with OpenTelemetry (Grafana):
 * Sentry sets up no tracing of its own and links its events to the active OpenTelemetry trace.
 * Imported only by `instrumentation.ts` when `SENTRY_DSN` is set, after OpenTelemetry started.
 */
import * as Sentry from "@sentry/node";

import type { ErrorReportContext, ErrorReporter } from "#core/log/errorReporter";

export type SentrySettings = {
  dsn: string;
  /** `questaria-api` or `questaria-media-worker`, as in Grafana. */
  serviceName: string;
  environment: string;
  release?: string | undefined;
};

/**
 * Default integrations that would report a second time what the app reports itself (Fastify's
 * error hook, the process handlers) or print to the console. What is collected is limited by
 * `dataCollection`; `scrubEvent` repeats it for whatever an integration still attaches.
 */
const LEFT_OUT = new Set([
  "Fastify",
  "OnUncaughtException",
  "OnUnhandledRejection",
  "Console",
]);

const KEPT_HEADERS = new Set(["user-agent", "content-type", "accept"]);

function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

/** No query values, cookies, bodies or credentials in an event; users only by id. */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    const { url, method, headers } = event.request;
    event.request = {
      ...(url ? { url: withoutQuery(url) } : {}),
      ...(method ? { method } : {}),
      ...(headers
        ? {
            headers: Object.fromEntries(
              Object.entries(headers).filter(([name]) => KEPT_HEADERS.has(name.toLowerCase())),
            ),
          }
        : {}),
    };
  }

  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }

  return event;
}

export function startSentry(settings: SentrySettings): void {
  Sentry.init({
    dsn: settings.dsn,
    environment: settings.environment,
    ...(settings.release ? { release: settings.release } : {}),
    // Nothing about people or requests beyond what the app passes itself (user id, codes).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...KEPT_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // Sentry Logs are on by default; the logger sends lines from SENTRY_LOG_LEVEL (`sentryLogStream`).
    // Express, Hapi … hooks are not needed; module loading is already hooked for OpenTelemetry.
    enableRuntimeChannelInjection: false,
    integrations: (defaults) => [
      ...defaults.filter((integration) => !LEFT_OUT.has(integration.name)),
      Sentry.openTelemetryIntegration(),
    ],
    initialScope: { tags: { service: settings.serviceName } },
    beforeSend: scrubEvent,
  });
}

const TAGS = ["task", "route", "errorCode", "requestId", "campaignId"] as const;

export function createSentryErrorReporter(): ErrorReporter {
  return {
    capture(error: unknown, context: ErrorReportContext) {
      Sentry.withScope((scope) => {
        scope.setLevel(context.fatal ? "fatal" : "error");
        if (context.userId) scope.setUser({ id: context.userId });

        const rest: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(context)) {
          if ((TAGS as readonly string[]).includes(key) && value !== null && value !== undefined) {
            scope.setTag(key, String(value));
          } else if (key !== "userId" && key !== "fatal") {
            rest[key] = value;
          }
        }
        if (Object.keys(rest).length > 0) scope.setContext("report", rest);

        Sentry.captureException(error);
      });
    },
    flush(timeoutMs = 2000) {
      return Sentry.flush(timeoutMs);
    },
  };
}
