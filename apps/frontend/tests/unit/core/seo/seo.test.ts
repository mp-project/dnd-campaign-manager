import { SUPPORTED_LOCALES } from "@dnd/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import { frontendModules } from "@/app/modules";
import { localizedPath, localizedRouteName } from "@/core/i18n/localizedRoutes";
import { installAppHead } from "@/core/seo/appHead";
import { jsonLd, usePageMeta } from "@/core/seo/pageMeta";
import { PUBLIC_PAGES } from "@/core/seo/publicPages";

import { mountWithApp } from "../../helpers/mount";

const head = (selector: string) => document.head.querySelector(selector);
const content = (selector: string) => head(selector)?.getAttribute("content");

function appRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes(frontendModules) });
}

async function openPage(url: string, structuredData?: () => object[]) {
  const router = appRouter();
  await router.push(url);
  const Page = defineComponent({
    setup() {
      usePageMeta({ title: () => "Impressum", description: () => "Wer hinter Chronik steht.", structuredData });
      return () => null;
    },
  });
  return mountWithApp(Page, { router });
}

afterEach(() => {
  vi.unstubAllEnvs();
  document.head.innerHTML = "";
});

describe("public pages", () => {
  it("lists only pages the router knows, in each of their languages", () => {
    const router = appRouter();
    for (const page of PUBLIC_PAGES) {
      for (const locale of page.locales) {
        const name = page.locales.length > 1 ? localizedRouteName(page.name, locale) : page.name;
        expect(router.hasRoute(name), name).toBe(true);
        expect(router.resolve({ name }).path).toBe(localizedPath(page.path, locale));
      }
    }
  });
});

describe("usePageMeta", () => {
  it("writes title, description, robots, canonical and the preview for a page in one language", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://chronik.example/");
    const { wrapper } = await openPage("/impressum");

    expect(document.title).toBe("Impressum – Chronik");
    expect(content('meta[name="description"]')).toBe("Wer hinter Chronik steht.");
    expect(content('meta[name="robots"]')).toBe("index, follow");
    expect(head('link[rel="canonical"]')?.getAttribute("href")).toBe("https://chronik.example/impressum");
    // Only German: no language alternates.
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(0);
    expect(content('meta[property="og:url"]')).toBe("https://chronik.example/impressum");
    expect(content('meta[property="og:image"]')).toBe("https://chronik.example/og/seite.jpg");
    expect(content('meta[property="og:locale"]')).toBe("de_DE");
    expect(content('meta[name="twitter:card"]')).toBe("summary_large_image");

    wrapper.unmount();
    expect(document.head.querySelector("[data-page-meta]")).toBeNull();
  });

  it("says when the page is ready for prerendering, and takes it back when it is left", async () => {
    const { wrapper } = await openPage("/impressum");
    await vi.waitFor(() => expect(document.documentElement.dataset.prerendered).toBe("ready"));
    wrapper.unmount();
    expect(document.documentElement.dataset.prerendered).toBeUndefined();
  });

  it("links every language of the start page and names its own picture", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://chronik.example");
    await openPage("/en");

    const alternates = [...document.head.querySelectorAll('link[rel="alternate"]')].map((link) => [
      link.getAttribute("hreflang"),
      link.getAttribute("href"),
    ]);
    expect(alternates).toEqual([
      ...SUPPORTED_LOCALES.map((locale) => [locale, `https://chronik.example${localizedPath("", locale)}`]),
      ["x-default", "https://chronik.example/"],
    ]);
    // The start page's title stays as it is (brand and claim).
    expect(document.title).toBe("Impressum");
    expect(head('link[rel="canonical"]')?.getAttribute("href")).toBe("https://chronik.example/en");
    expect(content('meta[property="og:image"]')).toBe("https://chronik.example/og/start-en.jpg");
    expect(content('meta[property="og:locale"]')).toBe("en_US");
    expect(content('meta[property="og:locale:alternate"]')).toBe("de_DE");
  });

  it("writes structured data as JSON-LD that text can't break out of", async () => {
    await openPage("/impressum", () => [{ "@type": "WebSite", name: "</script><script>alert(1)</script>" }]);
    const script = head('script[type="application/ld+json"]');
    expect(script?.textContent).toBe(jsonLd({ "@type": "WebSite", name: "</script><script>alert(1)</script>" }));
    expect(script?.textContent).not.toContain("</script>");
    expect(JSON.parse(script!.textContent!)).toEqual({ "@type": "WebSite", name: "</script><script>alert(1)</script>" });
  });
});

describe("app head", () => {
  it("marks every page that is not public as noindex", async () => {
    const router = appRouter();
    installAppHead(router);
    const robots = () => document.head.querySelector('meta[name="robots"][data-app-robots]');

    await router.push("/dashboard");
    expect(robots()?.getAttribute("content")).toBe("noindex, nofollow");
    await router.push("/impressum");
    expect(robots()).toBeNull();
    await router.push("/gibt-es-nicht");
    expect(robots()).not.toBeNull();
  });
});
