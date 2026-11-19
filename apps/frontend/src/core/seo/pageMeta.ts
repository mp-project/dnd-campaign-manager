import { DEFAULT_LOCALE, type Locale } from "@dnd/i18n";
import { nextTick, onBeforeUnmount, onMounted, watchEffect } from "vue";
import { useRoute } from "vue-router";

import { useAppI18n } from "@/core/i18n";
import { localizedPath } from "@/core/i18n/localizedRoutes";

import { publicPageOf } from "./publicPages";
import { absoluteUrl } from "./site";

const MARK = "data-page-meta";

/** Open Graph wants a territory with the language. */
const OG_LOCALE: Record<Locale, string> = { de: "de_DE", en: "en_US" };

/** Preview pictures in `public/og` (1200 × 630): one per language for the start page, one for the rest. */
export const OG_IMAGE = { width: 1200, height: 630 } as const;
const ogImagePath = (path: string, locale: Locale) => (path === "" ? `/og/start-${locale}.jpg` : "/og/seite.jpg");

function element<K extends "meta" | "link" | "script">(tag: K, key: string): HTMLElementTagNameMap[K] {
  let found = document.head.querySelector<HTMLElementTagNameMap[K]>(`${tag}[${MARK}="${key}"]`);
  if (!found) {
    found = document.createElement(tag);
    found.setAttribute(MARK, key);
    document.head.append(found);
  }
  return found;
}

function meta(key: string, attribute: "name" | "property", value: string): void {
  const tag = element("meta", key);
  tag.setAttribute(attribute, key);
  tag.content = value;
}

/** JSON in a script tag: `<` is escaped, so text can't close the tag. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The head of a public page (listed in `PUBLIC_PAGES`) for search engines and link previews:
 * `<title>` (`<title> – <brand>`, the start page's title as it is), description, robots,
 * `canonical`, `hreflang` alternates (only for pages in more than one language, `x-default`
 * German), Open Graph, Twitter card and JSON-LD (`structuredData`). Addresses are absolute on the
 * site's address (`VITE_SITE_URL`). Everything is removed again when the page is left.
 */
export function usePageMeta(options: {
  title: () => string;
  description: () => string;
  structuredData?: () => object[];
}): void {
  const route = useRoute();
  const { t } = useAppI18n();
  const appTitle = document.title;

  watchEffect(() => {
    const page = publicPageOf(route);
    const path = page?.path ?? "";
    const locales = page?.locales ?? [DEFAULT_LOCALE];
    const locale = route.meta.locale ?? DEFAULT_LOCALE;
    const brand = t("common.app.name");
    const title = path === "" ? options.title() : `${options.title()} – ${brand}`;
    const description = options.description();
    const url = absoluteUrl(localizedPath(path, locale));
    const image = absoluteUrl(ogImagePath(path, locale));

    document.title = title;
    meta("description", "name", description);
    meta("robots", "name", page?.index === false ? "noindex, follow" : "index, follow");

    const canonical = element("link", "canonical");
    canonical.rel = "canonical";
    canonical.href = url;
    document.head.querySelectorAll(`link[${MARK}^="alternate-"]`).forEach((node) => node.remove());
    if (locales.length > 1) {
      for (const other of [...locales, "x-default" as const]) {
        const alternate = element("link", `alternate-${other}`);
        alternate.rel = "alternate";
        alternate.hreflang = other;
        alternate.href = absoluteUrl(localizedPath(path, other === "x-default" ? DEFAULT_LOCALE : other));
      }
    }

    meta("og:type", "property", "website");
    meta("og:site_name", "property", brand);
    meta("og:title", "property", title);
    meta("og:description", "property", description);
    meta("og:url", "property", url);
    meta("og:image", "property", image);
    meta("og:image:width", "property", String(OG_IMAGE.width));
    meta("og:image:height", "property", String(OG_IMAGE.height));
    meta("og:image:alt", "property", t("common.seo.imageAlt"));
    meta("og:locale", "property", OG_LOCALE[locale]);
    document.head.querySelectorAll(`meta[${MARK}^="og:locale:alternate"]`).forEach((node) => node.remove());
    for (const other of locales.filter((entry) => entry !== locale)) {
      const tag = element("meta", `og:locale:alternate-${other}`);
      tag.setAttribute("property", "og:locale:alternate");
      tag.content = OG_LOCALE[other];
    }
    meta("twitter:card", "name", "summary_large_image");
    meta("twitter:title", "name", title);
    meta("twitter:description", "name", description);
    meta("twitter:image", "name", image);

    document.head.querySelectorAll(`script[${MARK}^="ld-"]`).forEach((node) => node.remove());
    (options.structuredData?.() ?? []).forEach((data, position) => {
      const script = element("script", `ld-${position}`);
      script.type = "application/ld+json";
      script.textContent = jsonLd(data);
    });
  });

  usePrerenderReady();

  onBeforeUnmount(() => {
    document.head.querySelectorAll(`[${MARK}]`).forEach((node) => node.remove());
    document.title = appTitle;
  });
}

/**
 * Once the page is rendered and its fonts are in, `<html data-prerendered="ready">` tells the
 * prerendering at build time (`scripts/prerender.ts`) that the page can be saved.
 */
function usePrerenderReady(): void {
  onMounted(async () => {
    await nextTick();
    await document.fonts?.ready;
    document.documentElement.dataset.prerendered = "ready";
  });
  onBeforeUnmount(() => {
    delete document.documentElement.dataset.prerendered;
  });
}

/**
 * The head of an error page (not found): only the title (`<title> – <brand>`); `noindex` comes
 * from `installAppHead`, and there is no canonical address or preview, since the page belongs to no
 * address. Saved at build time as `dist/404.html`, which the server sends with status 404.
 */
export function useErrorPageHead(title: () => string): void {
  const { t } = useAppI18n();
  const appTitle = document.title;

  watchEffect(() => {
    document.title = `${title()} – ${t("common.app.name")}`;
  });
  usePrerenderReady();
  onBeforeUnmount(() => {
    document.title = appTitle;
  });
}
