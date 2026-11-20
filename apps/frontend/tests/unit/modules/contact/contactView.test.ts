import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
type Answer = { status: number; body: unknown; headers?: Record<string, string> };
const server = vi.hoisted(() => {
  const state = {
    /** Answers to the messages in order; the last one repeats. */
    answers: [] as Answer[],
    calls: [] as Array<{ path: string; body: Record<string, unknown> }>,
  };
  globalThis.fetch = (async (request: Request) => {
    const text = await request.text();
    state.calls.push({ path: new URL(request.url).pathname, body: text ? JSON.parse(text) : null });
    const answer = (state.answers.length > 1 ? state.answers.shift() : state.answers[0]) ?? { status: 202, body: { status: "accepted" } };
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json", ...answer.headers },
    });
  }) as typeof fetch;
  return state;
});

// The JS challenge itself is tested in challenge.test.ts; here each call hands out a new solved task.
const challenges = vi.hoisted(() => ({ solved: 0, fail: false }));
vi.mock("@/modules/contact/challenge", async (original) => {
  const actual = await original<typeof import("@/modules/contact/challenge")>();
  return {
  ...actual,
  solveContactChallenge: vi.fn(async () => {
    if (challenges.fail) throw new actual.ContactChallengeError();
    challenges.solved += 1;
    return {
      challenge: { parameters: { algorithm: "SHA-256", nonce: "n", salt: "s", cost: 1, keyLength: 32, keyPrefix: "00" }, signature: `sig-${challenges.solved}` },
      solution: { counter: challenges.solved, derivedKey: "00ab" },
    };
  }),
  };
});

import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import { contactModule } from "@/modules/contact";
import ContactView from "@/modules/contact/views/ContactView.vue";
import { landingModule } from "@/modules/landing";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const pages = defineFrontendModule({
  name: "pages",
  routes: { account: [{ path: "dashboard", name: "dashboard", component: { render: () => null } }] },
});

async function open(url = "/kontakt", locale = "de") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: buildRoutes([landingModule, authModule, legalModule, contactModule, pages]),
  });
  await router.push(url);
  const { wrapper } = await mountWithApp(ContactView, { router, locale });
  await flushPromises();
  return { wrapper, router };
}

type Wrapper = Awaited<ReturnType<typeof open>>["wrapper"];

async function fill(wrapper: Wrapper, values: Partial<Record<"firstName" | "lastName" | "email" | "message", string>> = {}) {
  const inputs = wrapper.findAll("form input:not([type=checkbox]):not(#contact-website)");
  await inputs[0]!.setValue(values.firstName ?? "Mira");
  await inputs[1]!.setValue(values.lastName ?? "Falkenstein");
  await inputs[2]!.setValue(values.email ?? "mira@example.test");
  await wrapper.find("form select").setValue("SUPPORT");
  await wrapper.find("form textarea").setValue(values.message ?? "Meine Spieler sehen die freigegebene Karte nicht.");
  await wrapper.find("form input[type=checkbox]").setValue(true);
}

const errors = (wrapper: Wrapper) => wrapper.findAll(".text-danger").map((error) => error.text());

afterEach(() => {
  server.calls.length = 0;
  server.answers = [];
  challenges.solved = 0;
  challenges.fail = false;
  vi.unstubAllEnvs();
});

const REFUSED_TASK: Answer = { status: 400, body: { error: { code: "VALIDATION_ERROR", message: "-", details: { challenge: "used" } } } };

describe("contact page", () => {
  it("has one public address per language: /kontakt and /en/kontakt", () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([contactModule]) });
    expect(router.resolve("/kontakt")).toMatchObject({ name: "contact", meta: { area: "bare", locale: "de" } });
    expect(router.resolve("/en/kontakt")).toMatchObject({ name: "contact.en", meta: { locale: "en" } });
  });

  it("asks for name, email, topic, message and the privacy policy, and points to the FAQ first", async () => {
    const { wrapper } = await open();
    expect(wrapper.find("h1").text()).toBe("Kontakt");
    expect(wrapper.findAll("form label").map((label) => label.text().replace(/\*$/, "").trim())).toEqual(
      expect.arrayContaining(["Vorname", "Nachname", "E-Mail-Adresse", "Thema", "Nachricht"]),
    );
    expect(wrapper.findAll("form select option").map((option) => option.text())).toEqual([
      "Thema wählen",
      "Allgemeine Frage",
      "Hilfe und Probleme",
      "Feedback und Ideen",
      "Datenschutz",
      "Presse und Kooperation",
      "Sonstiges",
    ]);
    expect(wrapper.text()).toContain("Ich habe die Datenschutzerklärung gelesen");
    const hrefs = wrapper.findAll("a").map((link) => link.attributes("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/faq", "/datenschutz"]));
    // The bot trap is out of sight, out of the tab order and hidden from screen readers.
    const trap = wrapper.find("#contact-website");
    expect(trap.attributes("tabindex")).toBe("-1");
    expect(trap.element.closest("[aria-hidden=true]")).not.toBeNull();
    // The page costs the API nothing until the visitor starts on the form (prerendering stays quiet).
    expect(server.calls).toEqual([]);
    expect(challenges.solved).toBe(0);
    await wrapper.find("form input").trigger("focusin");
    await wrapper.find("form textarea").trigger("focusin");
    await flushPromises();
    expect(challenges.solved).toBe(1);
    wrapper.unmount();
  });

  it("names every missing field and sends nothing", async () => {
    const { wrapper } = await open();
    await wrapper.find("form").trigger("submit");
    expect(errors(wrapper)).toEqual([
      "Bitte gib deinen Vornamen an.",
      "Bitte gib deinen Nachnamen an.",
      "Bitte gib eine gültige E-Mail-Adresse an.",
      "Bitte wähle ein Thema.",
      "Bitte schreib mindestens 10 Zeichen.",
      "Bitte bestätige, dass du die Datenschutzerklärung gelesen hast.",
    ]);
    expect(server.calls).toEqual([]);
    wrapper.unmount();
  });

  it("refuses an invalid address and a message that is too short", async () => {
    const { wrapper } = await open();
    await fill(wrapper, { email: "keine-adresse", message: "Hallo" });
    await wrapper.find("form").trigger("submit");
    expect(errors(wrapper)).toEqual(["Bitte gib eine gültige E-Mail-Adresse an.", "Bitte schreib mindestens 10 Zeichen."]);
    expect(server.calls).toEqual([]);
    wrapper.unmount();
  });

  it("sends the message and thanks the visitor", async () => {
    const { wrapper } = await open();
    await fill(wrapper, { firstName: "  Mira ", email: " mira@example.test " });
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls).toEqual([
      {
        path: "/api/v1/contact",
        body: {
          firstName: "Mira",
          lastName: "Falkenstein",
          email: "mira@example.test",
          topic: "SUPPORT",
          message: "Meine Spieler sehen die freigegebene Karte nicht.",
          privacyAccepted: true,
          challenge: expect.objectContaining({ challenge: expect.objectContaining({ signature: "sig-1" }) }),
        },
      },
    ]);
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find("[role=status]").text()).toContain("Danke für deine Nachricht!");
    expect(wrapper.text()).toContain("antworten dir an mira@example.test");

    // Another message starts with an empty form.
    await wrapper.findAll("button").find((button) => button.text() === "Weitere Nachricht schreiben")!.trigger("click");
    expect((wrapper.find("form textarea").element as HTMLTextAreaElement).value).toBe("");
    wrapper.unmount();
  });

  it("passes the bot trap on when something filled it", async () => {
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("#contact-website").setValue("https://spam.example");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(server.calls[0]!.body.website).toBe("https://spam.example");
    wrapper.unmount();
  });

  it("solves a new task once when the backend refuses one, and sends again", async () => {
    server.answers = [REFUSED_TASK, { status: 202, body: { status: "accepted" } }];
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(server.calls.map((call) => (call.body.challenge as { challenge: { signature: string } }).challenge.signature)).toEqual([
      "sig-1",
      "sig-2",
    ]);
    expect(wrapper.find("[role=status]").text()).toContain("Danke für deine Nachricht!");
    wrapper.unmount();
  });

  it("gives up after a second refused task and says why", async () => {
    server.answers = [REFUSED_TASK];
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(server.calls).toHaveLength(2);
    expect(wrapper.text()).toContain("Die Sicherheitsprüfung des Formulars hat nicht geklappt.");
    wrapper.unmount();
  });

  it("says so when the task can't be solved and starts a new one on the next try", async () => {
    challenges.fail = true;
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(server.calls).toEqual([]);
    expect(wrapper.text()).toContain("Die Sicherheitsprüfung des Formulars hat nicht geklappt.");

    challenges.fail = false;
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(server.calls).toHaveLength(1);
    expect(wrapper.find("[role=status]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("explains a refused message and keeps what was typed", async () => {
    server.answers = [{ status: 503, body: { error: { code: "SERVICE_UNAVAILABLE", message: "-" } } }];
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find("[role=alert], [aria-live]").exists()).toBe(true);
    expect(wrapper.find("form").exists()).toBe(true);
    expect((wrapper.find("form textarea").element as HTMLTextAreaElement).value).toContain("freigegebene Karte");
    wrapper.unmount();
  });

  it("says when to try again after too many messages", async () => {
    server.answers = [{ status: 429, body: { error: { code: "RATE_LIMITED", message: "-" } }, headers: { "retry-after": "300" } }];
    const { wrapper } = await open();
    await fill(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Versuch es in 5 Minuten erneut.");
    wrapper.unmount();
  });

  it("describes itself as contact page for search engines, in English too", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://questaria.example");
    const { wrapper } = await open("/en/kontakt", "en");
    expect(wrapper.find("h1").text()).toBe("Contact");
    expect(document.title).toBe("Contact – Questaria");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://questaria.example/en/kontakt");
    const data = JSON.parse(document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? "{}");
    expect(data).toMatchObject({ "@type": "ContactPage", url: "https://questaria.example/en/kontakt", inLanguage: "en" });
    wrapper.unmount();
  });
});
