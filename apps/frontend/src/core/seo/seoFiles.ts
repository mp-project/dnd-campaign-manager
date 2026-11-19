import { DEFAULT_LOCALE, localizedPath } from "@dnd/i18n";

import type { PublicPage } from "./publicPages.ts";

/*
 * robots.txt and sitemap.xml of the production site, written into `dist/` by the build
 * (`scripts/seo-files.ts`). Development and stage never get these: Caddy answers their robots.txt
 * with "Disallow: /" (`Caddyfile`, robots-<APP_ENV>). Plain functions without the browser, so the
 * build script and the tests share them.
 */

/** App areas: private, nothing to find. Pages with only `noindex` stay crawlable, so it is seen. */
const DISALLOWED = ["/dashboard", "/konto/", "/k/", "/_bausteine", "/_vorschaubild"];

/** `siteUrl` without a trailing slash; empty leaves out the sitemap line (no absolute address known). */
export function robotsTxt(siteUrl: string): string {
  const lines = ["User-agent: *", "Allow: /", ...DISALLOWED.map((path) => `Disallow: ${path}`)];
  if (siteUrl) lines.push("", `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${lines.join("\n")}\n`;
}

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * One `<url>` per indexed page and language, each naming all languages of its page and `x-default`
 * (German) as alternates, as Google expects them in both directions. No `lastmod` (there is no
 * reliable date), no `priority` or `changefreq` (ignored).
 */
export function sitemapXml(siteUrl: string, pages: readonly PublicPage[]): string {
  const urls = pages
    .filter((page) => page.index)
    .flatMap((page) =>
      page.locales.map((locale) => {
        const alternates =
          page.locales.length > 1
            ? [
                ...page.locales.map((other) => [other, localizedPath(page.path, other)] as const),
                ["x-default", localizedPath(page.path, DEFAULT_LOCALE)] as const,
              ].map(
                ([hreflang, path]) =>
                  `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${escapeXml(siteUrl + path)}"/>`,
              )
            : [];
        return [
          "  <url>",
          `    <loc>${escapeXml(siteUrl + localizedPath(page.path, locale))}</loc>`,
          ...alternates,
          "  </url>",
        ].join("\n");
      }),
    );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
