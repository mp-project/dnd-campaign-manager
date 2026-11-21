import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import { defineFrontendModule } from "@/core/modules";
import { PUBLIC_PAGES } from "@/core/seo/publicPages";
import { authModule } from "@/modules/auth";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { ROADMAP_PHASES } from "@/modules/landing/roadmap";
import RoadmapView from "@/modules/landing/views/RoadmapView.vue";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { account: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

function roadmapRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes([landingModule, authModule, legalModule, contactModule, pages]) });
}

async function open(options: { url?: string; locale?: string } = {}) {
  const router = roadmapRouter();
  await router.push(options.url ?? "/roadmap");
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { wrapper } = await mountWithApp(RoadmapView, { router, locale: options.locale ?? "de" });
  await flushPromises();
  return { wrapper, router, fetchSpy };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("roadmap page", () => {
  it("has one public, prerendered address per language: /roadmap and /en/roadmap", () => {
    const router = roadmapRouter();
    const german = router.resolve("/roadmap");
    expect(german).toMatchObject({ name: "landing-roadmap", meta: { area: "bare", locale: "de", localizedName: "landing-roadmap" } });
    expect(router.resolve("/en/roadmap")).toMatchObject({ name: "landing-roadmap.en", meta: { locale: "en" } });
    expect(PUBLIC_PAGES.find((page) => page.name === "landing-roadmap")).toMatchObject({ path: "roadmap", index: true, prerender: true });
  });

  it("shows every phase in order with its status and what it brings, without asking the API", async () => {
    const { wrapper, fetchSpy } = await open();
    expect(wrapper.find("h1").text()).toBe("Roadmap");
    const phases = wrapper.findAll("li.roadmap-phase");
    expect(phases).toHaveLength(ROADMAP_PHASES.length);
    expect(phases.map((phase) => phase.find("h2").text())).toEqual([
      "Fundament",
      "Kompendium",
      "Welt",
      "Abenteuer",
      "Spielrunde",
      "Austausch",
      "Spieltisch",
    ]);
    expect(phases[0]!.find(".badge").text()).toBe("In Arbeit");
    expect(phases[0]!.findAll("ul li")).toHaveLength(ROADMAP_PHASES[0]!.items.length);
    expect(fetchSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("marks the roadmap as the page shown in the navigation and leads on to the contact form", async () => {
    const { wrapper } = await open({ url: "/en/roadmap", locale: "en" });
    const current = wrapper.find("header nav").findAll("a").filter((link) => link.attributes("aria-current") === "page");
    expect(current.map((link) => [link.text(), link.attributes("href")])).toEqual([["Roadmap", "/en/roadmap"]]);
    expect(wrapper.find("main aside a").attributes("href")).toBe("/en/kontakt");
    wrapper.unmount();
  });

  it("lists its phases as chapters of the phone menu", async () => {
    const { wrapper } = await open();
    await wrapper.find("button[aria-controls=public-menu]").trigger("click");
    const menu = document.getElementById("public-menu")!;
    expect([...menu.querySelectorAll(".chapter-link")].map((link) => link.getAttribute("href"))).toEqual(
      ROADMAP_PHASES.map((phase) => `#roadmap-${phase.id}`),
    );
    wrapper.unmount();
  });
});
