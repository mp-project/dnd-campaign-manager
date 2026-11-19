import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SUPPORTED_LOCALES } from "@dnd/i18n";
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { frontendModules } from "@/app/modules";
import { buildRoutes } from "@/app/router";
import { localizedPath } from "@/core/i18n/localizedRoutes";
import { PUBLIC_PAGES } from "@/core/seo/publicPages";

/**
 * nginx answers 404 for every address outside the app's areas (`map $uri $app_area` in
 * nginx.conf) and for which no prerendered file exists. This keeps that list and the app's routes
 * in step: a route the list misses would answer 404 when opened directly.
 */
const nginx = readFileSync(join(import.meta.dirname, "../../../nginx.conf"), "utf8");
const appArea = new RegExp(/"~(\^\/\([^"]+)"\s+1;/.exec(nginx)![1]!);

/** Addresses served as prerendered files. */
const files = new Set(
  PUBLIC_PAGES.filter((page) => page.prerender).flatMap((page) => page.locales.map((locale) => localizedPath(page.path, locale))),
);

/** The address nginx sees for a route: parameters filled in with an example. */
const example = (path: string) => path.replace(/:[A-Za-z]+(\([^)]*\))?[*+?]?/g, "beispiel");

describe("server routes (nginx.conf)", () => {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes(frontendModules) });
  const routes = router
    .getRoutes()
    // The catch-all is the not-found page itself; development pages don't exist in production.
    .filter((route) => route.name !== "not-found" && !String(route.name ?? "").startsWith("dev-"));

  it("serves every page of the app, as a file or as the app", () => {
    const missing = routes
      .map((route) => example(route.path))
      .filter((address) => !files.has(address) && !appArea.test(address));
    expect(missing).toEqual([]);
  });

  it("keeps public pages out of the app's areas, so unknown addresses beside them answer 404", () => {
    for (const address of files) {
      if (address === "/login" || address === "/registrieren") continue; // sign-in steps live below them
      expect(appArea.test(address), address).toBe(false);
    }
  });

  it("answers 404 for addresses the app doesn't know", () => {
    for (const address of ["/gibt-es-nicht", "/faq/alt", "/kontaktformular", "/en/unbekannt", "/konten", "/kampagne"]) {
      expect(appArea.test(address), address).toBe(false);
      expect(files.has(address), address).toBe(false);
    }
  });

  it("keeps the address of campaign invitations the backend sends in its emails", () => {
    expect(appArea.test("/invitations/accept")).toBe(true);
  });

  it("has a public page in every language under /en", () => {
    expect([...files].filter((address) => address.startsWith("/en"))).toHaveLength(
      PUBLIC_PAGES.filter((page) => page.prerender && page.locales.length === SUPPORTED_LOCALES.length).length,
    );
  });
});
