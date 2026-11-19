import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "@dnd/i18n";
import type { RouteLocationNormalizedLoaded } from "vue-router";

/**
 * The public pages: the one list for search engines (indexing, sitemap, prerendering) and the page
 * transition of the public area. A route that is not listed here is app or utility: it gets
 * `noindex` (`installAppHead`). `name` is the route name (for pages made with `localizedRoutes`
 * the base name, `meta.localizedName`), `path` the address without language (`""` = start page).
 */
export interface PublicPage {
  name: string;
  path: string;
  /** Languages the page exists in; more than one only for pages made with `localizedRoutes`. */
  locales: readonly Locale[];
  /** Indexed and listed in the sitemap. */
  index: boolean;
  /** Saved as HTML at build time. */
  prerender: boolean;
  /** Changes between two such pages fade (animation plan, public area only). */
  pageTransition: boolean;
}

const GERMAN_ONLY = [DEFAULT_LOCALE] as const;

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { name: "landing", path: "", locales: SUPPORTED_LOCALES, index: true, prerender: true, pageTransition: true },
  { name: "landing-faq", path: "faq", locales: SUPPORTED_LOCALES, index: true, prerender: true, pageTransition: true },
  { name: "contact", path: "kontakt", locales: SUPPORTED_LOCALES, index: true, prerender: true, pageTransition: true },
  { name: "legal-imprint", path: "impressum", locales: GERMAN_ONLY, index: true, prerender: true, pageTransition: true },
  { name: "legal-privacy", path: "datenschutz", locales: GERMAN_ONLY, index: true, prerender: true, pageTransition: true },
  // Only the frame is prerendered; the form needs the browser.
  { name: "auth-login", path: "login", locales: GERMAN_ONLY, index: true, prerender: true, pageTransition: false },
  { name: "auth-register", path: "registrieren", locales: GERMAN_ONLY, index: true, prerender: true, pageTransition: false },
];

/** The listed page a route shows, if any. */
export function publicPageOf(route: Pick<RouteLocationNormalizedLoaded, "name" | "meta">): PublicPage | undefined {
  const name = route.meta.localizedName ?? (typeof route.name === "string" ? route.name : undefined);
  return PUBLIC_PAGES.find((page) => page.name === name);
}
