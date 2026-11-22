import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";

type ConsentListener = (statistics: boolean) => void;

const consent = vi.hoisted(() => ({
  listeners: [] as ConsentListener[],
  declined: [] as (() => void)[],
}));

vi.mock("@/core/consent/consent", () => ({
  onStatisticsConsent: (listener: ConsentListener) => {
    consent.listeners.push(listener);
    listener(false);
    return () => undefined;
  },
  onStatisticsDeclined: (listener: () => void) => {
    consent.declined.push(listener);
    return () => undefined;
  },
}));

const SHORT_ID = "7xKXtg2CW87d97TXJSDpbD";
const Page = { template: "<div />" };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "landing", component: Page },
      { path: "/kontakt", name: "contact", component: Page },
      { path: "/k/:campaign", name: "campaign-overview", component: Page },
    ],
  });
}

function grant(statistics: boolean): void {
  for (const listener of consent.listeners) listener(statistics);
}

/** The app's events in the data layer (no gtag commands, no GTM start). */
function events(name?: string): Record<string, unknown>[] {
  return (window.dataLayer ?? []).filter(
    (entry): entry is Record<string, unknown> =>
      !!entry && typeof entry === "object" && !("length" in entry) && "event" in entry && entry.event !== "gtm.js",
  ).filter((entry) => !name || entry.event === name);
}

function gtmScript(): HTMLScriptElement | null {
  return document.head.querySelector('script[src^="https://www.googletagmanager.com/gtm.js"]');
}

describe("analytics", () => {
  let uninstall: () => void = () => undefined;
  let router: Router;

  async function start(): Promise<typeof import("@/core/telemetry/analytics")> {
    vi.resetModules();
    const analytics = await import("@/core/telemetry/analytics");
    router = makeRouter();
    uninstall = analytics.installAnalytics(router);
    await router.push("/");
    await router.isReady();
    return analytics;
  }

  beforeEach(() => {
    consent.listeners.length = 0;
    consent.declined.length = 0;
    delete window.dataLayer;
    gtmScript()?.remove();
    document.body.innerHTML = "";
    vi.stubEnv("VITE_GTM_ID", "GTM-TEST1");
  });

  afterEach(() => {
    uninstall();
    vi.unstubAllEnvs();
  });

  it("loads nothing and records nothing without consent", async () => {
    const analytics = await start();
    document.body.innerHTML = '<button data-track="header.demo">Demo</button>';
    document.querySelector("button")!.click();
    analytics.track("custom");

    expect(gtmScript()).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("does nothing without a container id", async () => {
    vi.stubEnv("VITE_GTM_ID", "");
    await start();
    grant(true);

    expect(consent.listeners).toHaveLength(0);
    expect(gtmScript()).toBeNull();
  });

  it("loads Tag Manager once with consent and reports the page shown", async () => {
    await start();
    grant(true);
    grant(true);

    expect(gtmScript()?.src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-TEST1");
    expect(document.head.querySelectorAll('script[src^="https://www.googletagmanager.com"]')).toHaveLength(1);
    const commands = (window.dataLayer ?? []).filter((entry) => !!entry && typeof entry === "object" && "length" in entry);
    expect(Array.from(commands[0] as ArrayLike<unknown>)).toEqual([
      "consent",
      "default",
      { analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" },
    ]);
    expect(events("page_view")).toEqual([
      expect.objectContaining({ page_path: "/", page_name: "landing", page_type: "public" }),
    ]);
  });

  it("reports navigations without query, fragment, slug or app titles", async () => {
    await start();
    grant(true);
    document.title = "Die Schatten von Elaria";

    await router.push(`/k/${SHORT_ID}-die-schatten-von-elaria?tab=notes#top`);
    await vi.waitFor(() => expect(events("page_view")).toHaveLength(2));

    const view = events("page_view")[1]!;
    expect(view).toMatchObject({
      page_path: `/k/${SHORT_ID}`,
      page_location: `${window.location.origin}/k/${SHORT_ID}`,
      page_title: "campaign-overview",
      page_type: "app",
    });
    expect(JSON.stringify(view)).not.toContain("elaria");
  });

  it("reports clicks on marked elements with their detail and outbound links", async () => {
    await start();
    grant(true);
    document.body.innerHTML = `
      <div data-track="landing.storyline.route" role="radiogroup">
        <button data-track-detail="b"><span id="inner">B</span></button>
      </div>
      <a data-track="header.demo" href="https://demo.example.de/kampagne?x=1">Demo</a>
      <a data-track="faq.contact" href="/kontakt">Kontakt</a>
      <button id="plain">Plain</button>`;

    document.getElementById("inner")!.click();
    document.querySelector<HTMLElement>('[data-track="header.demo"]')!.addEventListener("click", (e) => e.preventDefault());
    document.querySelector<HTMLElement>('[data-track="header.demo"]')!.click();
    document.querySelector<HTMLElement>('[data-track="faq.contact"]')!.addEventListener("click", (e) => e.preventDefault());
    document.querySelector<HTMLElement>('[data-track="faq.contact"]')!.click();
    document.getElementById("plain")!.click();

    expect(events("ui_click")).toEqual([
      expect.objectContaining({ track_id: "landing.storyline.route", track_detail: "b", outbound: undefined }),
      expect.objectContaining({ track_id: "header.demo", link_url: "https://demo.example.de/kampagne", outbound: true }),
      expect.objectContaining({ track_id: "faq.contact", link_url: undefined, track_detail: undefined }),
    ]);
  });

  it("sends the scrubbed page context with every entry, the start of GTM included", async () => {
    await start();
    await router.push(`/k/${SHORT_ID}-die-schatten-von-elaria?tab=notes`);
    await nextTick();
    document.title = "Die Schatten von Elaria";
    grant(true);
    document.body.innerHTML = '<button data-track="campaign.test">Test</button>';
    document.querySelector("button")!.click();

    const entries = (window.dataLayer ?? []).filter(
      (entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && "event" in entry,
    );
    expect(entries.map((entry) => entry.event)).toEqual(["gtm.js", "page_view", "ui_click"]);
    for (const entry of entries) {
      expect(entry).toMatchObject({
        page_location: `${window.location.origin}/k/${SHORT_ID}`,
        page_referrer: `${window.location.origin}/`,
        page_title: "campaign-overview",
        page_type: "app",
      });
    }
    expect(JSON.stringify(window.dataLayer)).not.toMatch(/elaria|tab=notes/i);
  });

  it("counts middle clicks on marked links, not other buttons or non-links", async () => {
    await start();
    grant(true);
    document.body.innerHTML = `
      <a data-track="header.demo" href="https://demo.example.de/">Demo</a>
      <button data-track="faq.toggleAll">All</button>`;

    const link = document.querySelector("a")!;
    link.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    link.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 2 }));
    document.querySelector("button")!.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));

    expect(events("ui_click")).toEqual([expect.objectContaining({ track_id: "header.demo", outbound: true })]);
  });

  it("reports a click on a link with a broken address without failing", async () => {
    await start();
    grant(true);
    document.body.innerHTML = '<a data-track="legal.externalLink" href="http://[">Broken</a>';
    const link = document.querySelector("a")!;
    link.addEventListener("click", (event) => event.preventDefault());

    expect(() => link.click()).not.toThrow();
    expect(events("ui_click")).toEqual([
      expect.objectContaining({ track_id: "legal.externalLink", link_url: undefined, outbound: undefined }),
    ]);
  });

  it("reports start, submit and the result of a marked form, never its values", async () => {
    const analytics = await start();
    grant(true);
    document.body.innerHTML = `
      <form data-track="contact"><input name="email" value="lea@example.de"><input name="other"></form>`;
    const form = document.querySelector("form")!;
    form.addEventListener("submit", (event) => event.preventDefault());

    form.querySelector("input")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    form.querySelectorAll("input")[1]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    analytics.trackFormResult("contact", "error", "RATE_LIMITED");

    expect(events().map((entry) => entry.event)).toEqual(["page_view", "form_start", "form_submit", "form_error"]);
    expect(events("form_error")[0]).toMatchObject({ form_id: "contact", error_code: "RATE_LIMITED" });
    expect(JSON.stringify(window.dataLayer)).not.toContain("lea@example.de");
  });

  it("clears the parameters of the previous event", async () => {
    const analytics = await start();
    grant(true);
    analytics.trackFormResult("contact", "error", "RATE_LIMITED");
    analytics.track("custom");

    expect(events("custom")[0]).toMatchObject({ form_id: undefined, error_code: undefined });
    expect(Object.keys(events("custom")[0]!)).toContain("error_code");
  });

  it("removes Google's cookies when statistics are declined", async () => {
    await start();
    document.cookie = "_ga=GA1.1.123; path=/";
    document.cookie = "_ga_TEST1=GS1.1.1; path=/";
    document.cookie = "questaria=keep; path=/";

    for (const listener of consent.declined) listener();

    expect(document.cookie).not.toContain("_ga");
    expect(document.cookie).toContain("questaria=keep");
    document.cookie = "questaria=; Max-Age=0; path=/";
  });
});
