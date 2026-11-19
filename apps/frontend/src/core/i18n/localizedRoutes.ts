import { DEFAULT_LOCALE, type Locale, localizedPath, matchLocale, SUPPORTED_LOCALES } from "@dnd/i18n";
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

/** Address of a public page in one language (shared with the build's sitemap through `@dnd/i18n`). */
export { localizedPath };

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

/** A public page made with `localizedRoutes` (its base `name`) in the active language, as a link target. */
export function useLocalizedPage(name: string) {
  const { locale } = useAppI18n();
  return computed(() => ({ name: localizedRouteName(name, matchLocale(String(locale.value)) ?? DEFAULT_LOCALE) }));
}
