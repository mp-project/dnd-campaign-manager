import { describe, expect, it } from "vitest";

import type { PublicPage } from "@/core/seo/publicPages";
import { robotsTxt, sitemapXml } from "@/core/seo/seoFiles";

const page = (overrides: Partial<PublicPage>): PublicPage => ({
  name: "page",
  path: "",
  locales: ["de"],
  index: true,
  prerender: true,
  pageTransition: false,
  ...overrides,
});

describe("robots.txt", () => {
  it("keeps crawlers out of the app and names the sitemap", () => {
    const robots = robotsTxt("https://chronik.example");
    expect(robots).toContain("User-agent: *\nAllow: /\n");
    for (const path of ["/dashboard", "/konto/", "/k/"]) expect(robots).toContain(`Disallow: ${path}\n`);
    expect(robots).toContain("Sitemap: https://chronik.example/sitemap.xml\n");
  });

  it("names no sitemap without a site address", () => {
    expect(robotsTxt("")).not.toContain("Sitemap:");
  });
});

describe("sitemap.xml", () => {
  const xml = sitemapXml("https://chronik.example", [
    page({ name: "landing", path: "", locales: ["de", "en"] }),
    page({ name: "imprint", path: "impressum" }),
    page({ name: "secret", path: "geheim", index: false }),
  ]);
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]!);

  it("lists every indexed page in each language, nothing else", () => {
    expect(urls.map((url) => /<loc>(.*)<\/loc>/.exec(url)?.[1])).toEqual([
      "https://chronik.example/",
      "https://chronik.example/en",
      "https://chronik.example/impressum",
    ]);
  });

  it("names all languages and x-default on every language of a page, none on a page in one language", () => {
    for (const url of urls.slice(0, 2)) {
      expect([...url.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)].map((match) => [match[1], match[2]])).toEqual([
        ["de", "https://chronik.example/"],
        ["en", "https://chronik.example/en"],
        ["x-default", "https://chronik.example/"],
      ]);
    }
    expect(urls[2]).not.toContain("xhtml:link");
  });

  it("is well-formed XML", () => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.nodeName).toBe("urlset");
  });
});
