/**
 * After `vite build`: writes `dist/robots.txt` and `dist/sitemap.xml` for the production site from
 * `PUBLIC_PAGES` and `VITE_SITE_URL` (environment, else `.env` of the frontend). Without a site
 * address there is no sitemap (it needs absolute addresses) and robots.txt names none.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

import { PUBLIC_PAGES } from "../src/core/seo/publicPages.ts";
import { robotsTxt, sitemapXml } from "../src/core/seo/seoFiles.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const env = loadEnv(process.env.NODE_ENV === "development" ? "development" : "production", root, "VITE_");
const siteUrl = (env.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");

writeFileSync(`${dist}robots.txt`, robotsTxt(siteUrl));
if (siteUrl) {
  writeFileSync(`${dist}sitemap.xml`, sitemapXml(siteUrl, PUBLIC_PAGES));
  console.log(`seo: robots.txt and sitemap.xml for ${siteUrl}`);
} else {
  console.warn("seo: VITE_SITE_URL is not set, robots.txt without sitemap, no sitemap.xml");
}
