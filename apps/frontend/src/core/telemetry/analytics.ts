/**
 * Google Analytics through Google Tag Manager (`VITE_GTM_ID`), only with the consent for
 * "statistics": before it nothing is loaded, stored or queued, and a withdrawal reloads the page
 * without it (`consent`); every decline removes Google's cookies. Without the id it never loads.
 *
 * The app tells GTM what happened through `window.dataLayer`; the GA4 tag and its triggers live in
 * the GTM container (events and parameters: "Google Analytics" in CLAUDE.md). GA4 would add the
 * browser's address and title to every hit, so every entry, the start of GTM included, carries the
 * page context instead, which the container's Google tag must use: `page_location` and
 * `page_referrer` without query, fragment and slug (`addressPrivacy`), `page_title` only for public
 * pages (app titles can name campaigns, they get the route name), `page_path`, `page_name` (route)
 * and `page_type` `public` or `app`.
 * - `page_view` after every navigation.
 * - `ui_click` for every element marked with `data-track="<area>.<name>"` (buttons, links,
 *   controls); `data-track-detail` on it or on the part clicked inside it names the option, and
 *   links to other sites carry `link_url` and `outbound`.
 * - `form_start` (first focus), `form_submit` and, from the page, `form_success`, `form_invalid`
 *   and `form_error` for every `<form data-track="…">`. What was typed never leaves the browser.
 * Middle clicks on marked links count as clicks too.
 * - `track(event, params)` for anything else a page reports.
 */
import { nextTick } from "vue";
import type { RouteLocationNormalized, Router } from "vue-router";

import { onStatisticsConsent, onStatisticsDeclined } from "@/core/consent/consent";
import { logger } from "@/core/log";
import { publicPageOf } from "@/core/seo/publicPages";
import { scrubAddress } from "@/core/telemetry/addressPrivacy";

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const GTM_SCRIPT = "https://www.googletagmanager.com/gtm.js";

/**
 * The parameters of the app's events. GTM keeps every key of the data layer until it is set again,
 * so each event clears the ones it doesn't carry.
 */
const EVENT_KEYS = ["track_id", "track_detail", "link_url", "outbound", "form_id", "error_code"] as const;

/** The cookies Google Analytics sets (`_ga`, `_ga_<container>`, older `_gid`, `_gat…`). */
const GOOGLE_COOKIE = /^_(ga|gid|gat)(_|$)/;

type PageContext = {
  page_location: string;
  page_referrer: string | undefined;
  page_title: string;
  page_path: string;
  page_name: string;
  page_type: "public" | "app";
  language: string | undefined;
};

let active = false;
/** The page shown, sent with every entry; null until the first navigation rendered. */
let page: PageContext | null = null;

export function gtmId(): string {
  return import.meta.env.VITE_GTM_ID?.trim() ?? "";
}

function push(entry: unknown): void {
  (window.dataLayer ??= []).push(entry);
}

/** Google's `gtag` pushes the `arguments` object itself; GTM tells commands apart by that. */
const gtag: (...args: unknown[]) => void = function () {
  // eslint-disable-next-line prefer-rest-params -- the data layer expects an Arguments object
  push(arguments);
};

/** Reports `event` to Google Analytics; without consent nothing happens. */
export function track(event: string, params: AnalyticsParams = {}): void {
  if (!active) return;
  const cleared = Object.fromEntries(EVENT_KEYS.map((key) => [key, undefined]));
  push({ event, ...cleared, ...page, ...params });
}

/** The end of a marked form, reported by the page: sent, refused by the checks, or failed. */
export function trackFormResult(formId: string, result: "success" | "invalid" | "error", errorCode?: string): void {
  track(`form_${result}`, { form_id: formId, error_code: errorCode });
}

function routeName(route: RouteLocationNormalized): string {
  const name = route.meta.localizedName ?? route.name;
  return typeof name === "string" ? name : (route.matched.at(-1)?.path ?? "unknown");
}

/** Parses `href` against the page; null for what isn't an address (a broken or empty one). */
function parseAddress(href: string): URL | null {
  return URL.canParse(href, window.location.href) ? new URL(href, window.location.href) : null;
}

/** The address a visitor came from: the previous page, or for the first one the other site. */
function referrerOf(previous: PageContext | null): string | undefined {
  if (previous) return previous.page_location;
  const referrer = document.referrer ? parseAddress(document.referrer) : null;
  return referrer ? scrubAddress(referrer.href) : undefined;
}

function pageContextOf(route: RouteLocationNormalized, previous: PageContext | null): PageContext {
  const path = scrubAddress(route.path);
  const isPublic = publicPageOf(route) !== undefined;
  const name = routeName(route);
  return {
    page_location: `${window.location.origin}${path}`,
    page_referrer: referrerOf(previous),
    page_title: isPublic ? document.title : name,
    page_path: path,
    page_name: name,
    page_type: isPublic ? "public" : "app",
    language: document.documentElement.lang || undefined,
  };
}

function trackClick(event: MouseEvent): void {
  if (!active || !(event.target instanceof Element)) return;
  const marked = event.target.closest("[data-track]");
  if (!marked) return;
  const href = marked.getAttribute("href");
  // Other buttons than the main one count only as the middle click that opens a link.
  if (event.type === "auxclick" && (event.button !== 1 || href === null)) return;

  const detailOf = event.target.closest("[data-track-detail]");
  const detail = detailOf && marked.contains(detailOf) ? detailOf.getAttribute("data-track-detail") : null;
  const target = href ? parseAddress(href) : null;
  const outbound = target !== null && /^https?:$/.test(target.protocol) && target.origin !== window.location.origin;

  track("ui_click", {
    track_id: marked.getAttribute("data-track") ?? undefined,
    track_detail: detail ?? undefined,
    link_url: outbound ? scrubAddress(target.href) : undefined,
    outbound: outbound || undefined,
  });
}

function markedForm(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  return target.closest("form[data-track]")?.getAttribute("data-track") ?? null;
}

/** Removes Google's cookies on this host and the domains above it (GA sets them on the top one). */
export function forgetAnalyticsCookies(): void {
  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => GOOGLE_COOKIE.test(name));
  if (names.length === 0) return;

  const labels = window.location.hostname.split(".");
  const domains = [undefined, ...labels.slice(0, -1).map((_, index) => `.${labels.slice(index).join(".")}`)];
  for (const name of names) {
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

function loadTagManager(id: string): void {
  // Only after consent, so analytics may store; nothing for advertising.
  gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("set", "ads_data_redaction", true);
  push({ "gtm.start": Date.now(), event: "gtm.js", ...page });

  const script = document.createElement("script");
  script.async = true;
  script.src = `${GTM_SCRIPT}?id=${encodeURIComponent(id)}`;
  script.addEventListener("error", () => {
    // Blocked or offline: the app works without analytics.
    logger.warn("Google Tag Manager could not be loaded", { task: "analytics" });
  });
  document.head.append(script);
}

/** Starts analytics for the app; returns what removes its page listeners again (tests). */
export function installAnalytics(router: Router): () => void {
  const id = gtmId();
  if (!id) return () => undefined;

  let loaded = false;

  router.afterEach((to, _from, failure) => {
    if (failure) return;
    // After the page rendered, so public pages have set their title.
    void nextTick(() => {
      page = pageContextOf(to, page);
      track("page_view");
    });
  });

  // Capture, so the element is read before its own handler changes or removes it.
  document.addEventListener("click", trackClick, { capture: true });
  document.addEventListener("auxclick", trackClick, { capture: true });

  const started = new WeakSet<Element>();
  const trackFormStart = (event: FocusEvent) => {
    const form = event.target instanceof Element ? event.target.closest("form[data-track]") : null;
    if (!active || !form || started.has(form)) return;
    started.add(form);
    track("form_start", { form_id: form.getAttribute("data-track") ?? undefined });
  };
  const trackSubmit = (event: SubmitEvent) => {
    const formId = markedForm(event.target);
    if (formId) track("form_submit", { form_id: formId });
  };
  document.addEventListener("focusin", trackFormStart);
  document.addEventListener("submit", trackSubmit, { capture: true });

  onStatisticsDeclined(forgetAnalyticsCookies);

  onStatisticsConsent((granted) => {
    active = granted;
    // A withdrawal reloads the page (`consent`); until then nothing is sent.
    if (!granted || loaded) return;
    loaded = true;
    loadTagManager(id);
    // Before the first page rendered, its navigation reports it.
    if (page) track("page_view");
  });

  return () => {
    document.removeEventListener("click", trackClick, { capture: true });
    document.removeEventListener("auxclick", trackClick, { capture: true });
    document.removeEventListener("focusin", trackFormStart);
    document.removeEventListener("submit", trackSubmit, { capture: true });
  };
}
