/**
 * Consent for what is not technically necessary (today: Grafana Faro). Cookiebot asks and stores
 * the answer; the app only reads the category "statistics" and starts or stops what depends on it.
 * Cookiebot runs in manual mode (no `data-blockingmode="auto"`): automatic blocking would hold back
 * the app's own scripts, and nothing in the app loads a tracker by itself.
 *
 * Without `VITE_COOKIEBOT_ID` there is no banner and no consent. Cookiebot's free plan only
 * answers on the registered domain, so locally `VITE_DEV_CONSENT=statistics` grants the category
 * in development builds instead. Prerendering (a controlled browser) never loads Cookiebot.
 */
import { logger } from "@/core/log";

export type ConsentListener = (statistics: boolean) => void;

type CookiebotGlobal = {
  consent?: { statistics?: boolean };
  renew?: () => void;
};

declare global {
  interface Window {
    Cookiebot?: CookiebotGlobal;
  }
}

const COOKIEBOT_SCRIPT = "https://consent.cookiebot.com/uc.js";
const COOKIEBOT_EVENTS = ["CookiebotOnConsentReady", "CookiebotOnAccept", "CookiebotOnDecline"];

const listeners = new Set<ConsentListener>();
let statistics = false;

function publish(next: boolean): void {
  if (next === statistics) return;
  statistics = next;
  for (const listener of listeners) listener(next);
}

/** Calls `listener` now with the current answer and again whenever it changes; returns the unsubscribe. */
export function onStatisticsConsent(listener: ConsentListener): () => void {
  listeners.add(listener);
  listener(statistics);
  return () => listeners.delete(listener);
}

export function cookiebotId(): string {
  return import.meta.env.VITE_COOKIEBOT_ID?.trim() ?? "";
}

/** Whether visitors can open the consent dialog again (footer link). */
export function hasConsentManager(): boolean {
  return cookiebotId() !== "";
}

/** Opens Cookiebot's dialog to change or withdraw the consent. */
export function openConsentSettings(): void {
  window.Cookiebot?.renew?.();
}

function isControlledBrowser(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/**
 * Loads Cookiebot once (or applies the development consent). `locale` is the app's language, so
 * the banner speaks it too.
 */
export function startConsent(locale: string): void {
  if (isControlledBrowser()) return;

  const id = cookiebotId();

  if (!id) {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_CONSENT === "statistics") publish(true);
    return;
  }

  if (document.getElementById("Cookiebot")) return;

  const read = () => publish(window.Cookiebot?.consent?.statistics === true);
  for (const name of COOKIEBOT_EVENTS) window.addEventListener(name, read);

  const script = document.createElement("script");
  script.id = "Cookiebot";
  script.src = COOKIEBOT_SCRIPT;
  script.async = true;
  script.dataset.cbid = id;
  script.dataset.culture = locale;
  script.addEventListener("error", () => {
    // Blocked or offline: without Cookiebot there is no consent, so nothing optional starts.
    logger.warn("Cookiebot could not be loaded", { task: "consent" });
  });
  document.head.append(script);
}
