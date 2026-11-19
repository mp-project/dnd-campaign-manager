/**
 * After `vite build`: renders every public page with `prerender: true` (`PUBLIC_PAGES`) in each of its
 * languages in Chromium and saves the finished HTML as `dist/<path>/index.html`, so search engines
 * and link previews get title, description, preview and content without running the app. The
 * original `index.html` stays as `dist/app.html` for every other address (nginx: `try_files`).
 * The app mounts over the saved HTML as usual (no hydration).
 *
 * - The pages are served from `dist/` by a small server here; every request to another origin
 *   (API, push, analytics) is blocked: public pages must not need one.
 * - Reduced motion, so nothing waits hidden for a scroll animation in the saved HTML.
 * - A page is saved once it says so (`<html data-prerendered="ready">`, set by `usePageMeta`);
 *   a page that doesn't, or misses title, description, canonical or preview picture, fails the build.
 *
 * Needs `VITE_SITE_URL` (like the sitemap): canonical links and previews in the saved HTML must
 * name the real site, not this run's server; without it the step is skipped with a warning.
 * `PRERENDER=0` skips it too (quick local builds without Chromium).
 */
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { localizedPath } from "@dnd/i18n";
import { chromium } from "@playwright/test";
import { loadEnv } from "vite";

import { PUBLIC_PAGES } from "../src/core/seo/publicPages.ts";

const TIMEOUT_MS = 20_000;
const dist = fileURLToPath(new URL("../dist/", import.meta.url));

const root = fileURLToPath(new URL("..", import.meta.url));
const env = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", root, "VITE_");
if (process.env.PRERENDER === "0") {
  console.log("prerender: skipped (PRERENDER=0)");
  process.exit(0);
}
if (!env.VITE_SITE_URL?.trim()) {
  console.warn("prerender: VITE_SITE_URL is not set, pages are not prerendered");
  process.exit(0);
}

const template = readFileSync(join(dist, "index.html"), "utf8");
const TYPES: Record<string, string> = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
  ".xml": "application/xml",
};

// Files as they are; every page address gets the original app shell, also after pages were written.
const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  const file = normalize(join(dist, path));
  const isFile = file.startsWith(dist) && extname(file) !== "" && existsSync(file) && statSync(file).isFile();
  if (isFile) {
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(template);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** What every saved page must carry exactly once. */
const REQUIRED = {
  title: /<title>[^<]+<\/title>/g,
  description: /<meta [^>]*name="description"/g,
  canonical: /<link [^>]*rel="canonical"/g,
  "og:image": /<meta [^>]*property="og:image"/g,
} as const;

const browser = await chromium.launch();
const failures: string[] = [];
try {
  for (const page of PUBLIC_PAGES.filter((entry) => entry.prerender)) {
    for (const locale of page.locales) {
      const address = localizedPath(page.path, locale);
      const context = await browser.newContext({
        locale: locale === "de" ? "de-DE" : "en-US",
        reducedMotion: "reduce",
        viewport: { width: 1280, height: 900 },
      });
      await context.route("**/*", (route) =>
        route.request().url().startsWith(origin) ? route.continue() : route.abort("blockedbyclient"),
      );
      const tab = await context.newPage();
      try {
        await tab.goto(`${origin}${address}`, { waitUntil: "load" });
        await tab.waitForFunction(() => document.documentElement.dataset.prerendered === "ready", undefined, {
          timeout: TIMEOUT_MS,
        });
        // Marks of this run, not of the page.
        await tab.evaluate(() => {
          delete document.documentElement.dataset.prerendered;
          document.documentElement.removeAttribute("data-reduced-motion");
        });
        const html = await tab.content();
        const missing = Object.entries(REQUIRED)
          .filter(([, pattern]) => (html.match(pattern) ?? []).length !== 1)
          .map(([name]) => name);
        if (missing.length) {
          failures.push(`${address}: not exactly one ${missing.join(", ")}`);
          continue;
        }
        const target = join(dist, address, "index.html");
        mkdirSync(join(dist, address), { recursive: true });
        writeFileSync(target, html);
        console.log(`prerender: ${address}`);
      } catch (error) {
        failures.push(`${address}: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`prerender failed:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
writeFileSync(join(dist, "app.html"), template);
console.log("prerender: app.html for every other address");
