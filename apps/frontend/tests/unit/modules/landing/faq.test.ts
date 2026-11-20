import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import type { MessageKey } from "@/core/i18n/keys";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { FAQ_GROUPS, matchingQuestions, searchable } from "@/modules/landing/faq";
import FaqView from "@/modules/landing/views/FaqView.vue";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { account: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

function faqRouter() {
  return createRouter({ history: createMemoryHistory(), routes: buildRoutes([landingModule, authModule, legalModule, contactModule, pages]) });
}

async function open(options: { url?: string; locale?: string } = {}) {
  const router = faqRouter();
  await router.push(options.url ?? "/faq");
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const { wrapper } = await mountWithApp(FaqView, { router, locale: options.locale ?? "de" });
  await flushPromises();
  return { wrapper, router, fetchSpy };
}

type Wrapper = Awaited<ReturnType<typeof open>>["wrapper"];
const questions = (wrapper: Wrapper) => wrapper.findAll("li.faq-item");
const visible = (wrapper: Wrapper) =>
  questions(wrapper)
    .filter((item) => item.attributes("style")?.includes("display: none") !== true)
    .map((item) => item.find("button").text());
const openAnswers = (wrapper: Wrapper) =>
  wrapper
    .findAll("[role=region]")
    .filter((region) => region.attributes("style")?.includes("display: none") !== true)
    .map((region) => region.attributes("id"));
const structuredData = () =>
  [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((script) => JSON.parse(script.textContent ?? ""));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FAQ page", () => {
  it("has one public address per language: /faq in German, /en/faq in English", () => {
    const router = faqRouter();
    expect(router.resolve("/faq")).toMatchObject({ name: "landing-faq", meta: { area: "bare", locale: "de", localizedName: "landing-faq" } });
    expect(router.resolve("/en/faq")).toMatchObject({ name: "landing-faq.en", meta: { locale: "en" } });
  });

  it("shows every question by topic, the answers in the page but closed", async () => {
    const { wrapper, fetchSpy } = await open();
    expect(wrapper.find("h1").text()).toBe("Häufige Fragen");
    expect(wrapper.findAll("section[aria-labelledby^=faq-topic-] h2").map((heading) => heading.text())).toEqual([
      "Questaria kennenlernen",
      "Kampagne, Welt und Gruppe",
      "Charaktere und Spielrunde",
      "Konto und Sicherheit",
    ]);
    expect(questions(wrapper)).toHaveLength(20);
    // Prerendering and search engines need the answers in the HTML, also while closed.
    expect(wrapper.findAll("[role=region]")).toHaveLength(20);
    expect(wrapper.text()).toContain("Questaria ist eine Kampagnenverwaltung für D&D 5E (Dungeons & Dragons, 5. Edition).");
    expect(openAnswers(wrapper)).toEqual([]);
    expect(wrapper.find("[aria-live=polite]").text()).toBe("20 Fragen");
    // Like the start page it costs the API nothing.
    expect(fetchSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("opens and closes a question, and all of them at once", async () => {
    const { wrapper } = await open();
    const button = wrapper.find("#faq-roles-question");
    expect(button.attributes("aria-expanded")).toBe("false");
    expect(button.attributes("aria-controls")).toBe("faq-roles-answer");
    await button.trigger("click");
    expect(button.attributes("aria-expanded")).toBe("true");
    expect(openAnswers(wrapper)).toEqual(["faq-roles-answer"]);
    expect(wrapper.find("#faq-roles-answer").attributes("aria-labelledby")).toBe("faq-roles-question");
    await button.trigger("click");
    expect(openAnswers(wrapper)).toEqual([]);

    const all = wrapper.findAll("button").find((entry) => entry.text() === "Alle aufklappen")!;
    await all.trigger("click");
    expect(openAnswers(wrapper)).toHaveLength(20);
    expect(all.text()).toBe("Alle zuklappen");
    await all.trigger("click");
    expect(openAnswers(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it("opens the question named in the address", async () => {
    const { wrapper } = await open({ url: "/faq#faq-visibility" });
    expect(openAnswers(wrapper)).toEqual(["faq-visibility-answer"]);
    expect(wrapper.find("#faq-visibility").classes()).toContain("is-open");
    wrapper.unmount();
  });

  it("searches questions and answers, opens the matches and says when nothing fits", async () => {
    const { wrapper } = await open();
    const search = wrapper.find("input[type=search]");
    expect(wrapper.find("label[for=faq-search]").text()).toBe("Fragen durchsuchen");

    await search.setValue("Rolle");
    expect(visible(wrapper)).toEqual(["Wie kommt meine Gruppe in die Kampagne?", "Welche Rollen gibt es in einer Kampagne?"]);
    expect(openAnswers(wrapper)).toEqual(["faq-invite-answer", "faq-roles-answer"]);
    expect(wrapper.find("[aria-live=polite]").text()).toBe("2 passende Fragen");
    // Topics without a match step aside.
    const topics = wrapper.findAll("section[aria-labelledby^=faq-topic-]");
    expect(topics.filter((topic) => topic.attributes("style")?.includes("display: none") !== true)).toHaveLength(1);

    // Accents don't matter.
    await search.setValue("uberall");
    expect(visible(wrapper)).toEqual(["Wie behalte ich den Überblick über meine Geräte?"]);
    expect(wrapper.find("[aria-live=polite]").text()).toBe("Eine passende Frage");

    await search.setValue("Drachenhort");
    expect(visible(wrapper)).toEqual([]);
    expect(wrapper.text()).toContain("Zu „Drachenhort“ haben wir keine Frage gefunden.");
    await wrapper.findAll("button").find((entry) => entry.text() === "Suche zurücksetzen")!.trigger("click");
    expect(visible(wrapper)).toHaveLength(20);
    expect(openAnswers(wrapper)).toEqual([]);
    wrapper.unmount();
  });

  it("describes the questions as FAQPage and the way there as breadcrumbs for search engines", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://questaria.example");
    const { wrapper } = await open({ url: "/en/faq", locale: "en" });
    expect(document.title).toBe("FAQ on managing D&D campaigns – Questaria");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://questaria.example/en/faq");
    expect(document.head.querySelector('link[hreflang="de"]')?.getAttribute("href")).toBe("https://questaria.example/faq");

    const [faq, breadcrumbs] = structuredData();
    expect(faq).toMatchObject({ "@context": "https://schema.org", "@type": "FAQPage", inLanguage: "en", url: "https://questaria.example/en/faq" });
    expect(faq.mainEntity).toHaveLength(20);
    expect(faq.mainEntity[0]).toEqual({
      "@type": "Question",
      name: "What is Questaria?",
      acceptedAnswer: { "@type": "Answer", text: expect.stringContaining("campaign manager for D&D 5E") },
    });
    // Every question on the page is in the data, word for word.
    expect(faq.mainEntity.map((entry: { name: string }) => entry.name)).toEqual(questions(wrapper).map((item) => item.find("button").text()));
    expect(breadcrumbs).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://questaria.example/en" },
        { "@type": "ListItem", position: 2, name: "FAQ", item: "https://questaria.example/en/faq" },
      ],
    });
    wrapper.unmount();
    expect(structuredData()).toEqual([]);
  });

  it("links the start page, the topics and, below the answers, the next step", async () => {
    vi.stubEnv("VITE_DEMO_URL", "https://demo.example.com/");
    const { wrapper } = await open();
    const hrefs = wrapper.findAll("a").map((link) => link.attributes("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/", "#faq-topic-basics", "#faq-topic-account", "/datenschutz", "/impressum", "/kontakt"]));
    const demo = wrapper.find("#faq-demo-answer");
    expect(demo.findAll("a").map((link) => [link.text(), link.attributes("href")])).toEqual([
      ["Demo ansehen", "https://demo.example.com/"],
      ["Vorab registrieren", "/registrieren"],
    ]);
    // The header marks the FAQ as the page shown; the footer keeps to privacy and imprint.
    const current = wrapper.find("header nav").findAll("a").filter((link) => link.attributes("aria-current") === "page");
    expect(current.map((link) => link.text())).toEqual(["FAQ"]);
    expect(wrapper.find("footer nav").findAll("a").map((link) => link.attributes("href"))).toEqual(["/datenschutz", "/impressum"]);
    wrapper.unmount();
  });

  it("leaves the demo link out without a demo address", async () => {
    vi.stubEnv("VITE_DEMO_URL", "");
    const { wrapper } = await open();
    expect(wrapper.find("#faq-demo-answer").findAll("a").map((link) => link.text())).toEqual(["Vorab registrieren"]);
    wrapper.unmount();
  });

  it("lists its topics as chapters of the phone menu", async () => {
    const { wrapper } = await open();
    await wrapper.find("button[aria-controls=public-menu]").trigger("click");
    const menu = document.getElementById("public-menu")!;
    expect([...menu.querySelectorAll(".chapter-link .font-heading")].map((title) => title.textContent?.trim())).toEqual([
      "Questaria kennenlernen",
      "Kampagne, Welt und Gruppe",
      "Charaktere und Spielrunde",
      "Konto und Sicherheit",
    ]);
    expect([...menu.querySelectorAll(".chapter-link")].map((link) => link.getAttribute("href"))).toEqual([
      "#faq-topic-basics",
      "#faq-topic-campaign",
      "#faq-topic-table",
      "#faq-topic-account",
    ]);
    // Then the public navigation, the FAQ marked as the page shown.
    const pages = [...menu.querySelectorAll(".public-nav-link")];
    expect(pages.map((link) => [link.textContent?.trim(), link.getAttribute("aria-current")])).toEqual([
      ["FAQ", "page"],
      ["Roadmap", null],
      ["Kontakt", null],
    ]);
    wrapper.unmount();
  });
});

describe("FAQ search", () => {
  const text = (key: MessageKey) => ({ "landing.faq.questions.what.question": "Was ist Questaria?" })[key as string] ?? key;

  it("compares without case and accents", () => {
    expect(searchable("Überall ÄRGER")).toBe("uberall arger");
  });

  it("finds questions that contain every word, and all of them without a query", () => {
    expect(matchingQuestions(FAQ_GROUPS, "", text).size).toBe(20);
    expect([...matchingQuestions(FAQ_GROUPS, "  was QUESTARIA ", text)]).toEqual(["what"]);
    expect(matchingQuestions(FAQ_GROUPS, "was drache", text).size).toBe(0);
  });
});
