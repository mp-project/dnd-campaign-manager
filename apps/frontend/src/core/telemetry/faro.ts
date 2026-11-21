/**
 * Grafana Faro (frontend observability) runs only with the consent for "statistics": it starts
 * when the consent is given, pauses and forgets its session when it is withdrawn, and starts
 * again on a new consent. Without `VITE_FARO_URL` it never loads. Each browser gets its own
 * session, signed-in users their internal id (never an email), so several people behind one
 * address stay apart. Views are named after routes; addresses go out without query, fragment and
 * slug (`faroPrivacy`).
 */
import { hashKey, type QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { type Me, meQuery } from "@/core/auth/session";
import { onStatisticsConsent } from "@/core/consent/consent";
import { addLogSink, logger, type LogLevel } from "@/core/log";
import type { FaroClient } from "@/core/telemetry/faroClient";

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

export function remoteLogLevel(value: string | undefined): LogLevel {
  return LEVEL_ORDER.includes(value as LogLevel) ? (value as LogLevel) : "info";
}

export function faroUrl(): string {
  return import.meta.env.VITE_FARO_URL?.trim() ?? "";
}

type State = { client: FaroClient | null; active: boolean; view: string | null; userId: string | null };

export function installFaro(router: Router, queryClient: QueryClient): void {
  const url = faroUrl();
  if (!url) return;

  const state: State = { client: null, active: false, view: null, userId: null };
  const minimum = LEVEL_ORDER.indexOf(remoteLogLevel(import.meta.env.VITE_LOG_REMOTE_LEVEL));

  const applyMeta = () => {
    const faro = state.client?.faro;
    if (!faro || !state.active) return;
    if (state.view) faro.api.setView({ name: state.view });
    if (state.userId) faro.api.setUser({ id: state.userId });
    else faro.api.resetUser();
  };

  router.afterEach((to) => {
    state.view = typeof to.name === "string" ? to.name : (to.matched.at(-1)?.path ?? "unknown");
    applyMeta();
  });

  const meHash = hashKey(meQuery.queryKey);
  queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash !== meHash) return;
    if (event.type === "removed") state.userId = null;
    else if (event.type === "updated") state.userId = (event.query.state.data as Me | undefined)?.id ?? null;
    else return;
    applyMeta();
  });

  addLogSink((entry) => {
    if (state.active && LEVEL_ORDER.indexOf(entry.level) >= minimum) state.client?.sendLog(entry);
  });

  onStatisticsConsent((granted) => {
    state.active = granted;

    if (!granted) {
      if (!state.client) return;
      state.client.faro.pause();
      void import("@/core/telemetry/faroClient").then(({ forgetFaroSession }) => forgetFaroSession());
      return;
    }

    if (state.client) {
      state.client.faro.unpause();
      applyMeta();
      return;
    }

    void import("@/core/telemetry/faroClient")
      .then(({ createFaroClient }) => {
        // The consent may have been withdrawn while the chunk loaded.
        if (state.client || !state.active) return;
        state.client = createFaroClient({
          url,
          environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
          version: import.meta.env.VITE_APP_RELEASE || "dev",
        });
        applyMeta();
      })
      .catch((error: unknown) => {
        // A blocked or outdated chunk: the app works without analytics.
        logger.warn("Faro could not be loaded", { task: "faro", message: String(error) });
      });
  });
}
