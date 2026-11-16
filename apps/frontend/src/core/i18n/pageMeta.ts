import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@dnd/i18n";
import { onBeforeUnmount, watchEffect } from "vue";
import { useRoute } from "vue-router";

import { localizedPath } from "@/core/i18n/localizedRoutes";

const MARK = "data-page-meta";

function element<K extends "meta" | "link">(tag: K, key: string): HTMLElementTagNameMap[K] {
  let found = document.head.querySelector<HTMLElementTagNameMap[K]>(`${tag}[${MARK}="${key}"]`);
  if (!found) {
    found = document.createElement(tag);
    found.setAttribute(MARK, key);
    document.head.append(found);
  }
  return found;
}

/**
 * Title, description and language links of a public page for search engines and link previews:
 * `<title>`, `meta description`, `link canonical` (this language's address) and one
 * `link alternate hreflang` per language plus `x-default` (German). Only for routes made with
 * `localizedRoutes`; `path` is the page's path without language. Everything is removed again when
 * the page is left, and the title goes back to the app's.
 */
export function usePageMeta(meta: { title: () => string; description: () => string; path?: string }): void {
  const route = useRoute();
  const appTitle = document.title;
  const path = meta.path ?? "";
  const absolute = (locale: (typeof SUPPORTED_LOCALES)[number]) =>
    new URL(localizedPath(path, locale), location.origin).href;

  watchEffect(() => {
    document.title = meta.title();
    const description = element("meta", "description");
    description.name = "description";
    description.content = meta.description();

    const canonical = element("link", "canonical");
    canonical.rel = "canonical";
    canonical.href = absolute(route.meta.locale ?? DEFAULT_LOCALE);

    for (const locale of SUPPORTED_LOCALES) {
      const alternate = element("link", `alternate-${locale}`);
      alternate.rel = "alternate";
      alternate.hreflang = locale;
      alternate.href = absolute(locale);
    }
    const fallback = element("link", "alternate-x-default");
    fallback.rel = "alternate";
    fallback.hreflang = "x-default";
    fallback.href = absolute(DEFAULT_LOCALE);
  });

  onBeforeUnmount(() => {
    document.head.querySelectorAll(`[${MARK}]`).forEach((node) => node.remove());
    document.title = appTitle;
  });
}
