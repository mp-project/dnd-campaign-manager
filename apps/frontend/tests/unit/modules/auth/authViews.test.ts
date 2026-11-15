import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
const server = vi.hoisted(() => {
  const state = {
    answers: {} as Record<string, { status: number; body?: unknown; headers?: Record<string, string> }>,
    calls: [] as Array<{ path: string; body: unknown }>,
  };
  globalThis.fetch = (async (request: Request) => {
    const path = new URL(request.url).pathname;
    const text = await request.text();
    state.calls.push({ path, body: text ? JSON.parse(text) : null });
    const answer = state.answers[path] ?? { status: 404, body: { error: { code: "NOT_FOUND", message: "-" } } };
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json", ...answer.headers },
    });
  }) as typeof fetch;
  return state;
});

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import { timeZone } from "@/core/i18n/settings";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";
import ActivateView from "@/modules/auth/views/ActivateView.vue";
import LoginView from "@/modules/auth/views/LoginView.vue";
import OAuthCallbackView from "@/modules/auth/views/OAuthCallbackView.vue";
import RegisterView from "@/modules/auth/views/RegisterView.vue";
import ResetPasswordView from "@/modules/auth/views/ResetPasswordView.vue";
import UserMenu from "@/components/layout/UserMenu.vue";
import { legalModule } from "@/modules/legal";

import { mountWithApp } from "../../helpers/mount";

const page = { render: () => null };
const pages = defineFrontendModule({
  name: "pages",
  routes: { bare: [{ path: "dashboard", name: "dashboard", component: page }, { path: "k/:rest(.*)", name: "campaign", component: page }] },
});

const AUTH = "/api/v1/auth";
const error = (status: number, code: string) => ({ status, body: { error: { code, message: "-" } } });

async function open(component: Component, url: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, legalModule, pages]) });
  await router.push(url);
  const queryClient = new QueryClient();
  queryClient.setQueryData(["me", "profile"], { id: "previous-account" });
  const { wrapper } = await mountWithApp(component, { router, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return { wrapper, router, queryClient };
}

async function fill(wrapper: Awaited<ReturnType<typeof open>>["wrapper"], values: Record<string, string>) {
  for (const [selector, value] of Object.entries(values)) await wrapper.find(selector).setValue(value);
}

afterEach(() => {
  server.answers = {};
  server.calls.length = 0;
  document.body.innerHTML = "";
});

describe("sign-in", () => {
  it("signs in, drops the previous account's data and goes to the target page", async () => {
    server.answers[`${AUTH}/login`] = { status: 200, body: {} };
    const { wrapper, router, queryClient } = await open(LoginView, "/login?redirect=/k/abc-elaria/welt");

    await fill(wrapper, { 'input[type="email"]': " ada@example.test ", 'input[autocomplete="current-password"]': "geheim" });
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls).toEqual([{ path: `${AUTH}/login`, body: { email: "ada@example.test", password: "geheim" } }]);
    expect(queryClient.getQueryData(["me", "profile"])).toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe("/k/abc-elaria/welt");
  });

  it("never follows a target on another site", async () => {
    server.answers[`${AUTH}/login`] = { status: 200, body: {} };
    const { wrapper, router } = await open(LoginView, "/login?redirect=//evil.example/x");

    await fill(wrapper, { 'input[type="email"]': "ada@example.test", 'input[autocomplete="current-password"]': "geheim" });
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/dashboard");
  });

  it("links registration and the forgotten password, without tabs or trusting the device", async () => {
    const { wrapper } = await open(LoginView, "/login?redirect=/k/abc");
    expect(wrapper.find("[role=tablist]").exists()).toBe(false);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
    const links = wrapper.find("form").findAll("a").map((a) => [a.text(), a.attributes("href")]);
    expect(links).toEqual([
      ["Noch kein Konto? Registrieren", "/registrieren?redirect=/k/abc"],
      ["Passwort vergessen?", "/passwort-vergessen"],
    ]);
  });

  it("checks the fields before sending", async () => {
    const { wrapper } = await open(LoginView, "/login");

    await wrapper.find("form").trigger("submit");

    expect(server.calls).toEqual([]);
    expect(wrapper.text()).toContain("Bitte gib eine gültige E-Mail-Adresse ein.");
    expect(wrapper.text()).toContain("Bitte gib dein Passwort ein.");
  });

  it("leads an unconfirmed account to the code entry and says when a blocked one may try again", async () => {
    server.answers[`${AUTH}/login`] = error(409, "EMAIL_NOT_VERIFIED");
    const { wrapper, router } = await open(LoginView, "/login");
    await fill(wrapper, { 'input[type="email"]': "ada@example.test", 'input[autocomplete="current-password"]': "geheim" });
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const link = wrapper.findAll("a").find((a) => a.text() === "Zur Bestätigung");
    expect(link?.attributes("href")).toBe("/aktivierung");
    await link!.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("auth-activate");
    expect(router.options.history.state.email).toBe("ada@example.test");

    wrapper.unmount();
    server.answers[`${AUTH}/login`] = { ...error(429, "RATE_LIMITED"), headers: { "retry-after": "290" } };
    const second = await open(LoginView, "/login");
    await fill(second.wrapper, { 'input[type="email"]': "ada@example.test", 'input[autocomplete="current-password"]': "x" });
    await second.wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(second.wrapper.find('[role="alert"]').text()).toBe("Zu viele Versuche. Bitte versuche es in 5 Minuten erneut.");
  });

  it("shows where the visitor came from: confirmed email, failed link, new password", async () => {
    const cases: Array<[string, string]> = [
      ["/login?verified=1", "Deine E-Mail-Adresse ist bestätigt."],
      ["/login?verified=0", "Der Bestätigungslink ist ungültig"],
      ["/login?reset=1", "Dein Passwort wurde geändert."],
      ["/login?signedOut=partial", "Das Abmelden auf allen Geräten hat nicht geklappt."],
    ];
    for (const [url, text] of cases) {
      const { wrapper } = await open(LoginView, url);
      expect(wrapper.text()).toContain(text);
      wrapper.unmount();
    }
  });
});

describe("earlier addresses", () => {
  it("lead reset links from mails sent before the move to the new page", async () => {
    const { router } = await open(LoginView, "/auth/reset-password?token=abc123");
    expect(router.currentRoute.value.fullPath).toBe("/passwort-zuruecksetzen?token=abc123");
    await router.push("/auth/login?redirect=/k/abc");
    expect(router.currentRoute.value.fullPath).toBe("/login?redirect=/k/abc");
  });
});

describe("registration and confirmation", () => {
  it("registers and passes the email to the code entry without putting it in the URL", async () => {
    server.answers[`${AUTH}/register`] = { status: 202, body: { status: "accepted" } };
    const { wrapper, router } = await open(RegisterView, "/registrieren?redirect=/k/abc");
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("Ada");
    await inputs[1]!.setValue("Ada_Lovelace");
    await inputs[2]!.setValue("ada@example.test");
    await inputs[3]!.setValue("ein-langes-passwort");
    await inputs[4]!.setValue("ein-langes-passwort");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls[0]).toEqual({
      path: `${AUTH}/register`,
      body: {
        email: "ada@example.test",
        displayName: "Ada",
        username: "ada_lovelace",
        password: "ein-langes-passwort",
        privacyAccepted: true,
        locale: "de",
        timezone: timeZone.value,
      },
    });
    expect(router.currentRoute.value.fullPath).toBe("/aktivierung?redirect=/k/abc");
    expect(router.options.history.state.email).toBe("ada@example.test");
  });

  it("refuses short passwords, different repetitions and a missing consent", async () => {
    const { wrapper } = await open(RegisterView, "/registrieren");
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("Ada");
    await inputs[2]!.setValue("ada@example.test");
    await inputs[3]!.setValue("kurz");
    await inputs[4]!.setValue("anders");
    await wrapper.find("form").trigger("submit");

    expect(server.calls).toEqual([]);
    expect(wrapper.text()).toContain("Das Passwort braucht mindestens 12 Zeichen.");
    expect(wrapper.text()).toContain("Die Passwörter stimmen nicht überein.");
    expect(wrapper.text()).toContain("Bitte akzeptiere die Datenschutzrichtlinien.");
    // The policy opens in a new tab, so the form stays filled in.
    const policy = wrapper.findAll("a").find((a) => a.text() === "Datenschutzerklärung lesen");
    expect(policy?.attributes()).toMatchObject({ href: "/datenschutz", target: "_blank" });
  });

  it("confirms the code and continues to the sign-in", async () => {
    server.answers[`${AUTH}/register/verify-email`] = { status: 200, body: {} };
    const { wrapper, router } = await open(ActivateView, "/aktivierung");
    await wrapper.find('input[type="email"]').setValue("ada@example.test");
    const [first] = wrapper.findAll('input[inputmode="numeric"]');
    (first!.element as HTMLInputElement).value = "482716";
    await first!.trigger("input");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls[0]?.body).toEqual({ email: "ada@example.test", verificationCode: "482716" });
    expect(router.currentRoute.value.fullPath).toBe("/login?verified=1");
  });

  it("names a wrong code as such and sends a new one on request", async () => {
    server.answers[`${AUTH}/register/verify-email`] = error(409, "CONFLICT");
    server.answers[`${AUTH}/register/request-verification`] = { status: 202, body: { status: "accepted" } };
    const { wrapper } = await open(ActivateView, "/aktivierung");
    await wrapper.find('input[type="email"]').setValue("ada@example.test");
    const [first] = wrapper.findAll('input[inputmode="numeric"]');
    (first!.element as HTMLInputElement).value = "000000";
    await first!.trigger("input");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain("Der Code ist falsch oder abgelaufen.");

    await wrapper.findAll("button").find((button) => button.text() === "Code erneut senden")!.trigger("click");
    await flushPromises();
    expect(server.calls.at(-1)).toEqual({ path: `${AUTH}/register/request-verification`, body: { email: "ada@example.test" } });
    expect(wrapper.find('[role="status"]').text()).toContain("ein neuer Code unterwegs");
  });
});

describe("password reset", () => {
  it("sets the new password with the token from the link", async () => {
    server.answers[`${AUTH}/reset-password`] = { status: 204 };
    const { wrapper, router } = await open(ResetPasswordView, "/passwort-zuruecksetzen?token=abc123");
    for (const input of wrapper.findAll('input[autocomplete="new-password"]')) await input.setValue("ein-langes-passwort");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls[0]?.body).toEqual({ token: "abc123", newPassword: "ein-langes-passwort" });
    expect(router.currentRoute.value.fullPath).toBe("/login?reset=1");
  });

  it("offers a new link when the old one is used up", async () => {
    server.answers[`${AUTH}/reset-password`] = error(409, "PASSWORD_RESET_USED");
    const { wrapper } = await open(ResetPasswordView, "/passwort-zuruecksetzen?token=abc123");
    for (const input of wrapper.findAll('input[autocomplete="new-password"]')) await input.setValue("ein-langes-passwort");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Dieser Link zum Zurücksetzen wurde schon verwendet.");
    expect(wrapper.findAll("a").map((a) => a.attributes("href"))).toContain("/passwort-vergessen");
  });

  it("explains a link without token instead of showing the form", async () => {
    const { wrapper } = await open(ResetPasswordView, "/passwort-zuruecksetzen");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("Dieser Link ist unvollständig.");
  });
});

describe("back from an OAuth provider", () => {
  it("continues to the target page once signed in", async () => {
    const { router, queryClient } = await open(OAuthCallbackView, "/login/oauth?status=success&redirect=/k/abc");
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/k/abc"));
    expect(queryClient.getQueryData(["me", "profile"])).toBeUndefined();
  });

  it("creates the account with the completion form", async () => {
    server.answers[`${AUTH}/oauth/complete-registration`] = { status: 200, body: {} };
    const { wrapper, router } = await open(OAuthCallbackView, "/login/oauth?status=registration_required&redirect=/dashboard");
    await wrapper.findAll("input")[0]!.setValue("Ada");
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls[0]?.body).toEqual({ displayName: "Ada", privacyAccepted: true, locale: "de", timezone: timeZone.value });
    expect(router.currentRoute.value.fullPath).toBe("/dashboard");
  });

  it("translates the error code and ignores codes it doesn't know", async () => {
    const known = await open(OAuthCallbackView, "/login/oauth?status=error&code=OAUTH_EMAIL_IN_USE");
    expect(known.wrapper.text()).toContain("Diese E-Mail-Adresse wird schon von einem anderen Konto verwendet.");
    known.wrapper.unmount();

    const unknown = await open(OAuthCallbackView, "/login/oauth?status=error&code=common.app.name");
    expect(unknown.wrapper.text()).toContain("Die Anmeldung über den Anbieter hat nicht geklappt.");
  });
});

describe("signing out everywhere", () => {
  it("signs out this browser and says so when the other sessions could not be ended", async () => {
    server.answers[`${AUTH}/logout-all`] = error(503, "SERVICE_UNAVAILABLE");
    server.answers[`${AUTH}/logout`] = { status: 204 };
    const { wrapper, router } = await open(UserMenu, "/dashboard");

    await wrapper.find("button").trigger("click");
    const item = [...document.body.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
      (element) => element.textContent?.trim() === "Überall abmelden",
    );
    item!.click();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login?signedOut=partial"));

    expect(server.calls.map((call) => call.path)).toEqual(
      expect.arrayContaining([`${AUTH}/logout-all`, `${AUTH}/logout`]),
    );
  });
});
