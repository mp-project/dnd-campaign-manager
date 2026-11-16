import { DEFAULT_LOCALE, type Locale, matchLocale, SUPPORTED_LOCALES } from "@dnd/i18n";
import { computed } from "vue";
import type { RouteRecordRaw } from "vue-router";

import { useAppI18n } from "@/core/i18n";

/*
 * Public pages (start page, later the public marketplace) carry their language in the address, so
 * every language has its own URL for links and search engines: German without a prefix (`/`),
 * every other language under `/<lang>/…` (`/en`). The app itself has no language in its URLs.
 * The router guard of `app/localeRoutes.ts` activates the language of such a route.
 */

/** Route name of a public page in one language: the base name for German, `<name>.<lang>` else. */
export function localizedRouteName(name: string, locale: Locale): string {
  return locale === DEFAULT_LOCALE ? name : `${name}.${locale}`;
}

/** Address of a public page (path relative to `/`, without slashes) in one language. */
export function localizedPath(path: string, locale: Locale): string {
  const segments = [locale === DEFAULT_LOCALE ? "" : locale, path].filter(Boolean);
  return `/${segments.join("/")}`;
}

/**
 * One route per supported language for a public page of the bare area (relative `path`, `""`
 * for the start page). Each sets `meta.locale` and `meta.localizedName` (the base name, for the
 * language switch and the alternate links).
 */
export function localizedRoutes(route: RouteRecordRaw & { path: string; name: string }): RouteRecordRaw[] {
  return SUPPORTED_LOCALES.map(
    (locale) =>
      ({
        ...route,
        path: localizedPath(route.path, locale).slice(1),
        name: localizedRouteName(route.name, locale),
        meta: { ...route.meta, locale, localizedName: route.name },
      }) as RouteRecordRaw,
  );
}

/** The start page in the active language: the logo leads there from everywhere. */
export function useHomePath() {
  const { locale } = useAppI18n();
  return computed(() => localizedPath("", matchLocale(String(locale.value)) ?? DEFAULT_LOCALE));
}
