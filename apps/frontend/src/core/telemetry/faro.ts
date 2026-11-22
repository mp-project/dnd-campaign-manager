/**
 * Grafana Faro (frontend observability) runs only with the consent for "statistics": it starts
 * when the consent is given; a withdrawal pauses it and reloads the page without it, and every
 * decline removes what it stored. Without `VITE_FARO_URL` it never loads. Each browser gets its own
 * session, signed-in users their internal id (never an email), so several people behind one
 * address stay apart. Views are named after routes; addresses go out without query, fragment and
 * slug (`addressPrivacy`).
 */
import { hashKey, type QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { type Me, meQuery } from "@/core/auth/session";
import { onStatisticsConsent, onStatisticsDeclined } from "@/core/consent/consent";
import { addLogSink, logger, type LogLevel } from "@/core/log";
import type { FaroClient } from "@/core/telemetry/faroClient";

const LEVEL_ORDER: LogLevel[] = ["debug", "info", "warn", "error"];

/** What Faro stores in the browser (faro-web-sdk's session and navigation keys). */
export const FARO_STORAGE_KEYS = ["com.grafana.faro.session", "com.grafana.faro.lastNavigationId"];

/** Removes what Faro stored; storage that is blocked holds nothing either. */
export function forgetFaroStorage(): void {
  for (const key of FARO_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      // Blocked storage: nothing could have been stored.
    }
  }
}

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

  onStatisticsDeclined(forgetFaroStorage);

  onStatisticsConsent((granted) => {
    state.active = granted;

    // A withdrawal reloads the page (`consent`); until then nothing is sent.
    if (!granted) {
      state.client?.faro.pause();
      return;
    }

    if (state.client) return;

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
