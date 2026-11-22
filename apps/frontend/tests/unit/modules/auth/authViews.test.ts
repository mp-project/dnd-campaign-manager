import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, type Component } from "vue";

/** Clerk's components as stubs that show the props the page passes. */
function clerkStub(name: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup: (_props, { attrs }) => () => h("div", { "data-clerk": name, "data-props": JSON.stringify(attrs) }),
  });
}

vi.mock("@clerk/vue", () => ({
  SignIn: clerkStub("SignIn"),
  SignUp: clerkStub("SignUp"),
  Waitlist: clerkStub("Waitlist"),
  UserProfile: clerkStub("UserProfile"),
}));

const clerk = vi.hoisted(() => ({
  instance: null as null | {
    isSignedIn: boolean;
    session: { id: string } | null;
    user: { getSessions: () => Promise<Array<{ id: string; revoke: () => Promise<void> }>> } | null;
    signOut: () => Promise<void>;
  },
}));

vi.mock("@/core/auth/clerk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/auth/clerk")>()),
  loadClerk: async () => clerk.instance,
}));

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import UserMenu from "@/components/layout/UserMenu.vue";
import { timeZone } from "@/core/i18n/settings";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import LoginView from "@/modules/auth/views/LoginView.vue";
import RegisterView from "@/modules/auth/views/RegisterView.vue";
import WaitlistView from "@/modules/auth/views/WaitlistView.vue";
import { contactModule } from "@/modules/contact";
import { landingModule } from "@/modules/landing";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const page = { render: () => null };
const pages = defineFrontendModule({
  name: "pages",
  routes: { bare: [{ path: "dashboard", name: "dashboard", component: page }, { path: "k/:rest(.*)", name: "campaign", component: page }] },
});

function signedIn(overrides: Partial<NonNullable<typeof clerk.instance>> = {}) {
  clerk.instance = {
    isSignedIn: overrides.session !== null,
    session: { id: "sess_1" },
    user: { getSessions: async () => [] },
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
  return clerk.instance;
}

async function open(component: Component, url: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, legalModule, landingModule, contactModule, pages]) });
  await router.push(url);
  const queryClient = new QueryClient();
  queryClient.setQueryData(["me", "profile"], { id: "account", displayName: "Lea", userTag: "lea#000001" });
  const { wrapper } = await mountWithApp(component, { router, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  await flushPromises();
  return { wrapper, router, queryClient };
}

function clerkProps(wrapper: Awaited<ReturnType<typeof open>>["wrapper"], name: string): Record<string, unknown> {
  const element = wrapper.find(`[data-clerk=${name}]`);
  expect(element.exists()).toBe(true);
  return JSON.parse(element.attributes("data-props") ?? "{}") as Record<string, unknown>;
}

afterEach(() => {
  clerk.instance = null;
  document.body.innerHTML = "";
});

describe("sign-in", () => {
  it("shows Clerk's sign-in with the checked target page", async () => {
    signedIn({ session: null });
    const { wrapper } = await open(LoginView, "/login?redirect=/k/abc");

    expect(clerkProps(wrapper, "SignIn")).toMatchObject({
      routing: "path",
      path: "/login",
      "fallback-redirect-url": "/k/abc",
    });
  });

  it("never follows a target on another site", async () => {
    signedIn({ session: null });
    const { wrapper } = await open(LoginView, "/login?redirect=https://evil.example");

    expect(clerkProps(wrapper, "SignIn")).toMatchObject({ "fallback-redirect-url": "/dashboard" });
  });

  it("keeps Clerk's own steps on the page", async () => {
    signedIn({ session: null });
    const { router } = await open(LoginView, "/login/factor-one");

    expect(router.currentRoute.value.name).toBe("auth-login");
  });

  it("says when signing in is not available instead of an empty card", async () => {
    const { wrapper } = await open(LoginView, "/login");

    expect(wrapper.find("[data-clerk=SignIn]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Die Anmeldung ist gerade nicht erreichbar");
  });

  it("offers another account instead of the sign-in when the API refuses this one", async () => {
    const instance = signedIn();
    const { wrapper, router } = await open(LoginView, "/login?noAccess=1");

    expect(wrapper.find("[data-clerk=SignIn]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Mit diesem Konto kommst du gerade nicht in Questaria");

    await wrapper.findAll("button").find((button) => button.text() === "Abmelden und anderes Konto verwenden")!.trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login"));
    expect(instance.signOut).toHaveBeenCalled();
  });

  it("says when signing out everywhere failed", async () => {
    signedIn({ session: null });
    const { wrapper } = await open(LoginView, "/login?signedOut=partial");

    expect(wrapper.text()).toContain("Das Abmelden auf allen Geräten hat nicht geklappt");
  });
});

describe("registration", () => {
  it("passes this browser's language and time zone to the new account", async () => {
    signedIn({ session: null });
    timeZone.value = "Europe/Berlin";
    const { wrapper } = await open(RegisterView, "/registrieren");

    expect(clerkProps(wrapper, "SignUp")).toMatchObject({
      path: "/registrieren",
      "unsafe-metadata": { locale: "de", timezone: "Europe/Berlin" },
    });
  });
});

describe("waitlist", () => {
  it("shows Clerk's waitlist with the privacy note, in every language", async () => {
    signedIn({ session: null });
    const german = await open(WaitlistView, "/warteliste");

    expect(clerkProps(german.wrapper, "Waitlist")).toMatchObject({ "sign-in-url": "/login" });
    expect(german.wrapper.find("a[href='/datenschutz']").exists()).toBe(true);

    const english = await open(WaitlistView, "/en/warteliste");

    expect(english.router.currentRoute.value.name).toBe("auth-waitlist.en");
  });
});

describe("earlier addresses", () => {
  it("lead the old sign-in steps to the sign-in", async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, pages]) });

    for (const path of ["/aktivierung", "/passwort-vergessen", "/passwort-zuruecksetzen?token=x", "/auth/callback"]) {
      await router.push(path);
      expect(router.currentRoute.value.name).toBe("auth-login");
    }
  });
});

describe("signing out", () => {
  async function chooseMenuItem(label: string) {
    const { wrapper, router } = await open(UserMenu, "/dashboard");
    await wrapper.find("button").trigger("click");
    const item = [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
      (element) => element.textContent?.trim() === label,
    );
    item!.click();
    return router;
  }

  it("ends the other sessions of the account, then this one", async () => {
    const revoke = vi.fn(async () => undefined);
    const instance = signedIn({
      user: { getSessions: async () => [{ id: "sess_1", revoke }, { id: "sess_2", revoke }] },
    });

    const router = await chooseMenuItem("Überall abmelden");

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login"));
    expect(revoke).toHaveBeenCalledOnce();
    expect(instance.signOut).toHaveBeenCalled();
  });

  it("signs out this browser and says so when the other sessions could not be ended", async () => {
    const instance = signedIn({
      user: { getSessions: async () => Promise.reject(new Error("offline")) },
    });

    const router = await chooseMenuItem("Überall abmelden");

    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login?signedOut=partial"));
    expect(instance.signOut).toHaveBeenCalled();
  });
});

describe("cookie settings in the account menu", () => {
  async function menuLabels(): Promise<HTMLElement[]> {
    const { wrapper } = await open(UserMenu, "/dashboard");
    await wrapper.find("button").trigger("click");
    return [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")];
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    delete window.Cookiebot;
  });

  it("reopens Cookiebot's dialog", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "c03c6818-ca6f-4955-a00d-ff51e76300ef");
    const renew = vi.fn();
    window.Cookiebot = { renew };
    signedIn();

    const item = (await menuLabels()).find((element) => element.textContent?.trim() === "Cookie-Einstellungen");
    item!.click();

    expect(renew).toHaveBeenCalledOnce();
  });

  it("is missing without Cookiebot", async () => {
    vi.stubEnv("VITE_COOKIEBOT_ID", "");
    signedIn();

    const labels = (await menuLabels()).map((element) => element.textContent?.trim());

    expect(labels).not.toContain("Cookie-Einstellungen");
    expect(labels).toContain("Überall abmelden");
  });
});
