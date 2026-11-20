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
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { demoScreenUrl, demoUrl } from "@/core/demo";
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
    routes: buildRoutes([landingModule, authModule, legalModule, contactModule, pages]),
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

  it("presents the app, its main features and the way to pre-register", async () => {
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
    expect(hrefs(wrapper)).toEqual(expect.arrayContaining(["/registrieren", "/datenschutz", "/impressum", "/faq", "/roadmap", "/kontakt"]));
    // Sign-in is not offered while access goes through pre-registration.
    expect(hrefs(wrapper)).not.toContain("/login");
    // The header leads to FAQ, roadmap and contact (none of them the page shown), with the
    // pre-registration as a button on the right; the footer only to privacy and imprint.
    const header = wrapper.find("header");
    expect(header.find("nav").findAll("a").map((link) => [link.text(), link.attributes("href"), link.attributes("aria-current")])).toEqual([
      ["FAQ", "/faq", undefined],
      ["Roadmap", "/roadmap", undefined],
      ["Kontakt", "/kontakt", undefined],
    ]);
    const register = header.findAll("a.btn").find((link) => link.attributes("href") === "/registrieren");
    expect(register?.text()).toBe("Vorab registrieren");
    expect(register?.classes()).toContain("btn-primary");
    expect(wrapper.find("footer nav").findAll("a").map((link) => link.attributes("href"))).toEqual(["/datenschutz", "/impressum"]);
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
    // Each card carries its own motif; revealing shows the king.
    const motifs = cards.map((card) => card.find("img[loading=lazy]").attributes("src") ?? "");
    expect(motifs.map((src) => src.match(/more\/(\w+)\./)?.[1])).toEqual([
      "encounters",
      "factions",
      "sounds",
      "compendium",
      "reveals",
      "history",
      "languages",
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
    // The watercolour behind it is decoration; the screen is the picture with a description.
    expect(section.find("img:not([alt=''])").attributes("alt")).toContain("Ruf-Übersicht");
    expect(section.find("a").attributes("href")).toBe("https://demo.example.com/#/kampagne/welt/ruf");
    wrapper.unmount();
  });

  it("rides over the storyline board scene by scene, on the route the visitor chooses", async () => {
    vi.stubEnv("VITE_DEMO_URL", "https://demo.example.com/");
    const { wrapper } = await open();
    const article = wrapper.find("article[aria-labelledby=landing-feature-storylines]");
    // At first the whole board with a hint, no scene.
    expect(article.text()).toContain("zwei Routen, die sich am alten Tor wieder treffen");
    const steps = () => article.findAll("ol button");
    expect(steps().map((step) => step.text())).toEqual([
      "1Spuren im Nebel",
      "2Die Wache bestechen",
      "3Am alten Tor",
      "4Torwache",
    ]);
    await steps()[2]!.trigger("click");
    expect(steps()[2]!.attributes("aria-current")).toBe("step");
    expect(article.text()).toContain("Szene 3 von 4 · Offizieller Weg");
    await article.findAll("[role=radio]")[1]!.trigger("click");
    expect(steps().map((step) => step.text())).toContain("4Das versiegelte Gewölbe");
    expect(steps()[0]!.attributes("aria-current")).toBe("step");
    expect(article.text()).toContain("Szene 1 von 4 · Geheimer Zugang");
    // The stage leads nowhere itself; the demo link sits below it.
    expect(article.find("a").attributes("href")).toBe(
      "https://demo.example.com/#/kampagne/abenteuer/storylines/schatten-elaria/akt",
    );
    wrapper.unmount();
  });

  it("lets the visitor roll the character's Strength check", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { wrapper } = await open();
    const article = wrapper.find("article[aria-labelledby=landing-feature-characters]");
    expect(article.text()).toContain("Rüstungsklasse");
    expect(article.text()).toContain("Trefferpunkte");
    const die = article.find("button[aria-label='Stärke-Probe würfeln']");
    expect(die.text()).toContain("Antippen und würfeln");
    await die.trigger("click");
    // The roll is a GSAP timeline on GSAP's own clock, which fake timers don't drive.
    await vi.waitFor(() => expect(die.text()).toContain("11 + 2 = 13"), { timeout: 3000 });
    wrapper.unmount();
  });

  it("lets the visitor sort the inventory and use an item, the carrying load following", async () => {
    const { wrapper } = await open();
    const article = wrapper.find("article[aria-labelledby=landing-feature-inventory]");
    expect(article.find("h3").text()).toBe("Inventar verwalten");
    const names = () => article.findAll("li .font-heading.font-bold").map((name) => name.text());
    expect(names()[0]).toBe("Bronzenes Siegel");
    expect(article.text()).toContain("18 / 105 kg");
    await article.findAll("[role=radio]")[2]!.trigger("click");
    expect(names().slice(0, 2)).toEqual(["Fackel", "Rationen"]);
    await article.find("button[aria-label='Heiltrank benutzen']").trigger("click");
    expect(article.text()).toContain("17,8 / 105 kg");
    expect(article.text()).toContain("Heiltrank getrunken: +9 TP");
    wrapper.unmount();
  });

  it("shows the marketplace as a fan of three cards that spreads out on a click", async () => {
    const { wrapper } = await open();
    const section = wrapper.find("section[aria-labelledby=landing-marketplace]");
    const fan = section.find("[role=group]");
    expect(fan.attributes("aria-label")).toBe("Ansichten des Marktplatzes");
    expect(fan.findAll(".label").map((label) => label.text())).toEqual([
      "Offizielle Inhalte",
      "Gesamtpaket",
      "Community-Inhalte",
    ]);
    const button = section.find("button[aria-expanded]");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.text()).toBe("Antippen zum Auffächern");
    await fan.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("true");
    expect(button.text()).toBe("Antippen zum Zusammenlegen");
    await button.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("false");
    wrapper.unmount();
  });

  it("opens a table of contents from the compass on phones and closes it again", async () => {
    const { wrapper } = await open();
    const compass = wrapper.find("button[aria-controls=public-menu]");
    expect(compass.attributes("aria-expanded")).toBe("false");
    expect(compass.attributes("aria-label")).toBe("Menü öffnen");
    await compass.trigger("click");
    expect(compass.attributes("aria-expanded")).toBe("true");
    expect(compass.attributes("aria-label")).toBe("Menü schließen");
    const menu = document.getElementById("public-menu")!;
    expect([...menu.querySelectorAll(".chapter-link")].map((link) => [...link.querySelectorAll(".flex-1 > span")].map((part) => part.textContent?.trim()).join(" | "))).toEqual([
      "Kapitel I | Für wen | Spielleitungen, Spieler und Co-Autoren",
      "Kapitel II | Funktionen | Storylines, Charaktere und Sessions",
      "Kapitel III | Und außerdem | Encounter, Fraktionen, Musik und mehr",
      "Kapitel IV | Marktplatz | Offizielle Inhalte und Community",
      "Kapitel V | Ruf-System | Haltungen, die mit der Geschichte wachsen",
    ]);
    expect([...menu.querySelectorAll("a")].map((link) => link.textContent?.trim())).toEqual(
      expect.arrayContaining(["FAQ", "Roadmap", "Kontakt", "Vorab registrieren"]),
    );
    expect([...menu.querySelectorAll("a")].map((link) => link.textContent?.trim())).not.toContain("Anmelden");
    // A chapter closes the menu and moves the page to its section.
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    menu.querySelector<HTMLAnchorElement>(".chapter-link")!.click();
    await flushPromises();
    expect(scrollTo).toHaveBeenCalledOnce();
    expect(compass.attributes("aria-expanded")).toBe("false");
    // Escape closes it as well.
    await compass.trigger("click");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(compass.attributes("aria-expanded")).toBe("false");
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

  it("describes site, publisher and app for search engines", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://chronik.example");
    const { wrapper } = await open({ url: "/en", locale: "en" });
    const data = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((script) =>
      JSON.parse(script.textContent ?? ""),
    );
    expect(data.map((entry) => entry["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
    const [organization, website, app] = data;
    expect(organization).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://chronik.example/#organization",
      name: "Chronik",
      url: "https://chronik.example/",
    });
    expect(website).toMatchObject({ url: "https://chronik.example/en", inLanguage: "en", publisher: { "@id": organization["@id"] } });
    expect(app).toMatchObject({
      applicationCategory: "GameApplication",
      operatingSystem: "Web",
      availableLanguage: ["de", "en"],
      isPartOf: { "@id": website["@id"] },
    });
    expect(app.featureList).toEqual(expect.arrayContaining(["Manage characters", "Manage inventory"]));
    wrapper.unmount();
    expect(document.head.querySelector('script[type="application/ld+json"]')).toBeNull();
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

  it("shows the clickdummy's screens below a hero of pure illustration", async () => {
    vi.stubEnv("VITE_DEMO_URL", "");
    const { wrapper } = await open();
    const alts = wrapper.findAll("img[alt]").map((image) => image.attributes("alt")).filter(Boolean);
    expect(alts).toHaveLength(9);
    // The hero's dragon is decoration and loads first; everything else waits until needed.
    const hero = wrapper.find("section[aria-labelledby=landing-title] img");
    expect(hero.attributes("aria-hidden")).toBe("true");
    expect(hero.attributes("loading")).toBeUndefined();
    expect(alts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Charakterbogen von Arvel Merad"),
        expect.stringContaining("Akt-Board der Storyline"),
        expect.stringContaining("Weltkarte von Elaria"),
        expect.stringContaining("Marktplatz"),
        expect.stringContaining("SRD 5.2 – Gesamtpaket"),
        expect.stringContaining("Kampagnen & Community"),
      ]),
    );
    // Below the hero the pictures load only when needed: the screens, the slider's motifs and
    // the decoration (landscapes, watercolours, props), which screen readers don't see.
    const lazy = wrapper.findAll("img[loading=lazy]");
    expect(lazy.filter((img) => img.attributes("aria-hidden") !== "true")).toHaveLength(9);
    expect(lazy).toHaveLength(9 + 7 + 16);
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
