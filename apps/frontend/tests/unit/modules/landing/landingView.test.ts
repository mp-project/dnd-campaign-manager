import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { installLocaleRoutes } from "@/app/localeRoutes";
import { buildRoutes } from "@/app/router";
import { meQuery } from "@/core/auth/session";
import { createAppI18n, setLocale } from "@/core/i18n";
import { localizedPath, localizedRouteName } from "@/core/i18n/localizedRoutes";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { landingModule } from "@/modules/landing";
import { demoScreenUrl, demoUrl } from "@/modules/landing/demo";
import LandingView from "@/modules/landing/views/LandingView.vue";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { account: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

function landingRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: buildRoutes([landingModule, authModule, legalModule, pages]),
  });
}

async function open(options: { url?: string; locale?: string; signedIn?: boolean } = {}) {
  const router = landingRouter();
  await router.push(options.url ?? "/");
  const queryClient = new QueryClient();
  if (options.signedIn) queryClient.setQueryData(meQuery.queryKey, { id: "u1" } as never);
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { wrapper } = await mountWithApp(LandingView, {
    router,
    locale: options.locale ?? "de",
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  });
  await flushPromises();
  return { wrapper, router, fetchSpy };
}

const hrefs = (wrapper: Awaited<ReturnType<typeof open>>["wrapper"]) =>
  wrapper.findAll("a").map((link) => link.attributes("href"));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("landing page", () => {
  it("has one public address per language: / in German, /en in English", async () => {
    const router = landingRouter();
    await router.push("/");
    expect(router.currentRoute.value.name).toBe("landing");
    expect(router.currentRoute.value.meta).toMatchObject({ area: "bare", locale: "de", localizedName: "landing" });
    await router.push("/en");
    expect(router.currentRoute.value.name).toBe("landing.en");
    expect(router.currentRoute.value.meta).toMatchObject({ area: "bare", locale: "en" });
    // The app and unknown addresses stay where they were.
    expect(router.resolve("/dashboard").meta.area).toBe("account");
    expect(router.resolve("/gibt-es-nicht").name).toBe("not-found");
  });

  it("builds the addresses and names of public pages per language", () => {
    expect(localizedPath("", "de")).toBe("/");
    expect(localizedPath("", "en")).toBe("/en");
    expect(localizedPath("marktplatz", "en")).toBe("/en/marktplatz");
    expect(localizedRouteName("landing", "de")).toBe("landing");
    expect(localizedRouteName("landing", "en")).toBe("landing.en");
  });

  it("activates the language of the address before the page renders", async () => {
    const i18n = createAppI18n();
    const after = setLocale(i18n, "de", { remember: false });
    const router = landingRouter();
    installLocaleRoutes(router, i18n, { after, keepLocale: false });
    await router.push("/en");
    expect(i18n.global.locale.value).toBe("en");
    await router.push("/");
    expect(i18n.global.locale.value).toBe("de");
  });

  it("leaves the language alone while a development override is active", async () => {
    const i18n = createAppI18n();
    const after = setLocale(i18n, "de", { remember: false });
    const router = landingRouter();
    installLocaleRoutes(router, i18n, { after, keepLocale: true });
    await router.push("/en");
    expect(i18n.global.locale.value).toBe("de");
  });

  it("presents the app, its main features and the way to register and sign in", async () => {
    const { wrapper, fetchSpy } = await open();
    expect(wrapper.find("h1").text()).toBe("Deine Kampagne. Deine Welt. An einem Ort.");
    const headings = wrapper.findAll("h3").map((heading) => heading.text());
    expect(headings).toEqual(
      expect.arrayContaining([
        "Kampagnen planen",
        "Storylines verweben",
        "Quests mit Belohnungen",
        "Charaktere verwalten",
        "Spielsessions mit Einladungen",
      ]),
    );
    expect(wrapper.find("#landing-marketplace").text()).toBe("Inhalte teilen und entdecken");
    expect(hrefs(wrapper)).toEqual(expect.arrayContaining(["/registrieren", "/login", "/datenschutz", "/impressum"]));
    expect(hrefs(wrapper)).not.toContain("/dashboard");
    // Visitors without a session cost the API nothing.
    expect(fetchSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shows the further features as a slider on navy, languages as German and English for now", async () => {
    const { wrapper } = await open();
    const section = wrapper.find("section[aria-labelledby=landing-more]");
    expect(section.find("h2").text()).toBe("Und außerdem");
    const slider = section.find("[aria-roledescription=carousel]");
    expect(slider.attributes("aria-label")).toBe("Und außerdem");
    const cards = slider.findAll("[aria-roledescription=slide]");
    expect(cards.map((card) => card.find("h3").text())).toEqual([
      "Encounter",
      "Fraktionen",
      "Musik und Soundeffekte",
      "Kompendium nach Regelwerk",
      "Gezielt freigeben",
      "Nichts geht verloren",
      "Deutsch und Englisch",
    ]);
    expect(cards[0]!.attributes("aria-label")).toBe("Karte 1 von 7");
    expect(cards.at(-1)!.text()).toContain("aktuell Deutsch und Englisch");
    wrapper.unmount();
  });

  it("presents the reputation system with its sources and a screen of it", async () => {
    vi.stubEnv("VITE_DEMO_URL", "https://demo.example.com/");
    const { wrapper } = await open();
    const section = wrapper.find("section[aria-labelledby=landing-reputation]");
    expect(section.find("h2").text()).toBe("Ein Ruf, der mit der Geschichte wächst");
    expect(section.findAll("ul[aria-label] li").map((source) => source.text())).toEqual([
      "Story-Ereignisse",
      "Quests",
      "Encounter",
      "Manuell anpassen",
    ]);
    expect(section.find("img").attributes("alt")).toContain("Ruf-Übersicht");
    expect(section.find("a").attributes("href")).toBe("https://demo.example.com/#/kampagne/welt/ruf");
    wrapper.unmount();
  });

  it("links the logo to the start page in the active language", async () => {
    const german = await open();
    expect(german.wrapper.find("header a").attributes("href")).toBe("/");
    german.wrapper.unmount();
    const english = await open({ url: "/en", locale: "en" });
    expect(english.wrapper.find("header a").attributes("href")).toBe("/en");
    english.wrapper.unmount();
  });

  it("chooses the language from a globe menu that leads to the page's other address", async () => {
    const { wrapper, router } = await open();
    const globe = wrapper.find("header button[aria-haspopup=menu]");
    expect(globe.attributes("aria-label")).toBe("Sprache wählen");
    expect(globe.text()).toBe("");
    await globe.trigger("click");
    await flushPromises();
    const entries = [...document.body.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
    expect(entries.map((entry) => entry.textContent?.trim())).toEqual(["Deutsch", "English"]);
    entries[1]!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/en"));
    wrapper.unmount();
  });

  it("sets title, description and the language links for search engines, and removes them again", async () => {
    const { wrapper } = await open({ url: "/en", locale: "en" });
    expect(document.title).toBe("Chronik – campaign manager for D&D 5E");
    expect(document.head.querySelector<HTMLMetaElement>("meta[name=description]")?.content).toContain("game masters");
    const link = (selector: string) => document.head.querySelector<HTMLLinkElement>(selector)?.getAttribute("href");
    expect(link("link[rel=canonical]")).toBe(`${location.origin}/en`);
    expect(link("link[hreflang=de]")).toBe(`${location.origin}/`);
    expect(link("link[hreflang=en]")).toBe(`${location.origin}/en`);
    expect(link("link[hreflang=x-default]")).toBe(`${location.origin}/`);
    wrapper.unmount();
    expect(document.head.querySelector("link[rel=canonical]")).toBeNull();
    expect(document.head.querySelector("meta[name=description]")).toBeNull();
  });

  it("shows English texts", async () => {
    const { wrapper } = await open({ url: "/en", locale: "en" });
    expect(wrapper.find("h1").text()).toBe("Your campaign. Your world. In one place.");
    expect(wrapper.text()).toContain("Game sessions with invitations");
    wrapper.unmount();
  });

  it("leads a signed-in visitor into the app instead of the sign-in", async () => {
    const { wrapper } = await open({ signedIn: true });
    expect(hrefs(wrapper)).toContain("/dashboard");
    expect(hrefs(wrapper)).not.toContain("/login");
    expect(hrefs(wrapper)).not.toContain("/registrieren");
    wrapper.unmount();
  });

  it("leaves the demo links out without a demo address", async () => {
    vi.stubEnv("VITE_DEMO_URL", "");
    const { wrapper } = await open();
    expect(wrapper.text()).not.toContain("Demo ansehen");
    wrapper.unmount();
  });

  it("links the demo when its address is set", async () => {
    vi.stubEnv("VITE_DEMO_URL", "https://demo.example.com/");
    const { wrapper } = await open();
    const demo = wrapper.findAll("a").filter((link) => link.text() === "Demo ansehen");
    expect(demo).toHaveLength(2);
    expect(demo[0]!.attributes("href")).toBe("https://demo.example.com/");
    wrapper.unmount();
  });

  it("shows the clickdummy's screens, the hero split into character sheet and storyline", async () => {
    vi.stubEnv("VITE_DEMO_URL", "");
    const { wrapper } = await open();
    const alts = wrapper.findAll("img[alt]").map((image) => image.attributes("alt")).filter(Boolean);
    expect(alts).toHaveLength(9);
    expect(alts.slice(0, 2)).toEqual([
      expect.stringContaining("Charakterbogen von Arvel Merad"),
      expect.stringContaining("Akt-Board der Storyline"),
    ]);
    expect(alts).toEqual(expect.arrayContaining([expect.stringContaining("Weltkarte von Elaria"), expect.stringContaining("Marktplatz")]));
    // Below the hero the pictures load only when needed.
    expect(wrapper.findAll("img[loading=lazy]")).toHaveLength(7);
    // Without a demo the pictures lead nowhere.
    expect(hrefs(wrapper).filter((href) => href?.includes("#/"))).toEqual([]);
    wrapper.unmount();
  });

  it("leads every screen to the same screen of the demo", async () => {
    vi.stubEnv("VITE_DEMO_URL", "https://demo.example.com/");
    const { wrapper } = await open();
    const screens = hrefs(wrapper).filter((href) => href?.includes("#/"));
    expect(screens).toEqual(
      expect.arrayContaining([
        "https://demo.example.com/#/kampagne/abenteuer/storylines/schatten-elaria/akt",
        "https://demo.example.com/#/spiel/charakter",
        "https://demo.example.com/#/kampagne/welt/orte/atlas",
        "https://demo.example.com/#/marketplace",
      ]),
    );
    expect(wrapper.find("header").findAll("a").map((link) => link.text())).toContain("Demo");
    // Every way into the demo opens it in a new tab, next to the start page.
    const demoLinks = wrapper.findAll("a").filter((link) => link.attributes("href")?.startsWith("https://demo.example.com"));
    expect(demoLinks.length).toBeGreaterThanOrEqual(10);
    for (const link of demoLinks) {
      expect(link.attributes("target")).toBe("_blank");
      expect(link.attributes("rel")).toBe("noopener");
    }
    wrapper.unmount();
  });

  it("builds demo screen addresses from the demo address", () => {
    expect(demoScreenUrl("/marketplace", "https://demo.example.com")).toBe("https://demo.example.com/#/marketplace");
    expect(demoScreenUrl("/spiel/charakter", "https://demo.example.com/#/dashboard")).toBe(
      "https://demo.example.com/#/spiel/charakter",
    );
    expect(demoScreenUrl("/marketplace", "nope")).toBeNull();
  });

  it("accepts only absolute http(s) addresses for the demo", () => {
    expect(demoUrl(" https://demo.example.com ")).toBe("https://demo.example.com");
    expect(demoUrl("javascript:alert(1)")).toBeNull();
    expect(demoUrl("/demo")).toBeNull();
    expect(demoUrl("")).toBeNull();
  });
});
