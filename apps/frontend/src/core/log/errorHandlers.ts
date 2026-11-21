import type { App } from "vue";
import type { Router } from "vue-router";

import { logger } from "@/core/log/logger";
import { reportError } from "@/core/log/reportError";

const CHUNK_RELOAD_KEY = "questaria.chunkReload";

/** A file of an older build that is gone after a deploy. */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    error.message,
  );
}

function readFlag(): string | null {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY);
  } catch {
    // Storage blocked: then a reload might loop, so it is not tried.
    return "blocked";
  }
}

function writeFlag(value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    else sessionStorage.setItem(CHUNK_RELOAD_KEY, value);
  } catch {
    // See `readFlag`.
  }
}

/**
 * Loading a page failed because its file belongs to an older build: the page is loaded once more
 * from the server (with the new build). A second failure in the same tab is reported instead, so
 * a broken deploy can't make the tab reload forever.
 */
export function handleRouterError(error: unknown, to: string, reload: (to: string) => void): void {
  if (isChunkLoadError(error) && readFlag() === null) {
    writeFlag(to);
    logger.warn("Reloading after a deploy", { to });
    reload(to);
    return;
  }
  reportError(error, { source: "router", to });
}

/**
 * Every error nobody handled ends up here: in components, lifecycle hooks and watchers, in
 * promises without `catch` and when loading a page. Queries and mutations report through their
 * caches (`createAppQueryClient`).
 */
export function installErrorHandlers(app: App, router: Router): void {
  app.config.errorHandler = (error, _instance, info) => {
    reportError(error, { source: "vue", info });
  };

  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, { source: "window" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "promise" });
  });

  router.onError((error, to) => {
    handleRouterError(error, to.fullPath, (path) => window.location.assign(path));
  });
  // A page that loaded fine ends the reload attempt of the previous deploy.
  router.afterEach(() => {
    if (readFlag() !== null) writeFlag(null);
  });
}
