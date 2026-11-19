import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
const server = vi.hoisted(() => {
  const state = {
    answers: {} as Record<string, { status: number; body?: unknown }>,
    calls: [] as Array<{ method: string; path: string; body: unknown }>,
  };
  globalThis.fetch = (async (request: Request) => {
    const path = new URL(request.url).pathname;
    const text = await request.text();
    state.calls.push({ method: request.method, path, body: text ? JSON.parse(text) : null });
    const answer = state.answers[`${request.method} ${path}`] ?? { status: 404, body: { error: { code: "NOT_FOUND", message: "-" } } };
    return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return state;
});

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import type { Me } from "@/core/auth/session";
import { authModule } from "@/modules/auth";
import { legalModule } from "@/modules/legal";
import { usersModule } from "@/modules/users";
import { describeUserAgent } from "@/modules/users/device";
import ProfileTab from "@/modules/users/views/ProfileTab.vue";
import SecurityTab from "@/modules/users/views/SecurityTab.vue";

import { mountWithApp } from "../../helpers/mount";

const ME: Me = {
  id: "u1",
  email: "ada@example.test",
  displayName: "Ada",
  username: "ada",
  userTag: "ada#123456",
  systemRole: "USER",
  status: "ACTIVE",
  emailVerificationRequiredCode: null,
  pendingEmail: null,
  settings: { locale: "de", timezone: "Europe/Berlin", theme: "SYSTEM", reducedMotion: false, uiPreferences: {} },
  effectiveGlobalPermissions: [],
  signIn: { password: true, providers: [] },
};
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14) Gecko/20100101 Firefox/133.0";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18) AppleWebKit Version/18 Mobile Safari/604.1";

async function open(component: Component, url: string, me: Me = ME) {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, legalModule, usersModule]) });
  await router.push(url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["me", "profile"], me);
  const { wrapper } = await mountWithApp(component, { router, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  await flushPromises();
  return { wrapper, router, queryClient };
}

afterEach(() => {
  server.answers = {};
  server.calls.length = 0;
  document.body.innerHTML = "";
});

describe("device names", () => {
  it("names browser and system from the user agent", () => {
    expect(describeUserAgent(FIREFOX)).toEqual({ browser: "Firefox", system: "macOS" });
    expect(describeUserAgent(PHONE)).toEqual({ browser: "Safari", system: "iOS" });
    expect(describeUserAgent(null)).toEqual({ browser: null, system: null });
    // Other browsers on iOS also name Safari in their agent.
    expect(describeUserAgent(`${PHONE} EdgiOS/131.0`).browser).toBe("Edge");
    expect(describeUserAgent(`${PHONE} FxiOS/133.0`).browser).toBe("Firefox");
  });
});

describe("profile", () => {
  it("sends only what changed and keeps the answer as the profile", async () => {
    server.answers["PATCH /api/v1/me/settings"] = { status: 200, body: { ...ME, settings: { ...ME.settings, timezone: "Europe/London" } } };
    const { wrapper, queryClient } = await open(ProfileTab, "/konto/profil");

    const selects = wrapper.findAll("select");
    await selects[1]!.setValue("Europe/London");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls).toEqual([{ method: "PATCH", path: "/api/v1/me/settings", body: { timezone: "Europe/London" } }]);
    expect((queryClient.getQueryData(["me", "profile"]) as Me).settings.timezone).toBe("Europe/London");
    expect(wrapper.find('[role="status"]').text()).toBe("Dein Profil ist gespeichert.");
  });

  it("saves reduced motion as a setting", async () => {
    server.answers["PATCH /api/v1/me/settings"] = { status: 200, body: { ...ME, settings: { ...ME.settings, reducedMotion: true } } };
    const { wrapper, queryClient } = await open(ProfileTab, "/konto/profil");

    const toggle = wrapper.find('[role="switch"]');
    expect(toggle.attributes("aria-label")).toBe("Bewegung reduzieren");
    expect(toggle.attributes("aria-checked")).toBe("false");
    await toggle.trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls).toEqual([{ method: "PATCH", path: "/api/v1/me/settings", body: { reducedMotion: true } }]);
    expect((queryClient.getQueryData(["me", "profile"]) as Me).settings.reducedMotion).toBe(true);
  });

  it("keeps a saved name when saving the settings fails afterwards", async () => {
    server.answers["PATCH /api/v1/me"] = { status: 200, body: { ...ME, displayName: "Ada L." } };
    server.answers["PATCH /api/v1/me/settings"] = { status: 503, body: { error: { code: "SERVICE_UNAVAILABLE", message: "-" } } };
    const { wrapper, queryClient } = await open(ProfileTab, "/konto/profil");

    await wrapper.find('input[autocomplete="nickname"]').setValue("Ada L.");
    await wrapper.findAll("select")[1]!.setValue("Europe/London");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect((queryClient.getQueryData(["me", "profile"]) as Me).displayName).toBe("Ada L.");
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });

  it("shows the user tag and email read-only", async () => {
    const { wrapper } = await open(ProfileTab, "/konto/profil");
    const readonly = wrapper.findAll("input[readonly]").map((input) => (input.element as HTMLInputElement).value);
    expect(readonly).toEqual(["ada#123456", "ada@example.test"]);
  });
});

describe("sign-in and security", () => {
  it("lists sessions with this device first and signs out another one", async () => {
    server.answers["GET /api/v1/auth/sessions"] = {
      status: 200,
      body: {
        items: [
          { id: "s1", userAgent: FIREFOX, startedAt: "2026-11-01T10:00:00Z", lastActiveAt: "2026-11-15T10:00:00Z", expiresAt: "2026-12-01T10:00:00Z", current: true },
          { id: "s2", userAgent: PHONE, startedAt: "2026-11-10T10:00:00Z", lastActiveAt: "2026-11-14T10:00:00Z", expiresAt: "2026-12-01T10:00:00Z", current: false },
        ],
      },
    };
    server.answers["GET /api/v1/me/trusted-devices"] = { status: 200, body: { items: [] } };
    server.answers["DELETE /api/v1/auth/sessions/s2"] = { status: 204 };
    const { wrapper } = await open(SecurityTab, "/konto/anmeldung");

    expect(wrapper.text()).toContain("Firefox auf macOS");
    expect(wrapper.text()).toContain("Safari auf iOS");
    await wrapper.find('button[aria-label="Safari auf iOS abmelden"]').trigger("click");
    await flushPromises();
    expect(server.calls.some((call) => call.method === "DELETE" && call.path === "/api/v1/auth/sessions/s2")).toBe(true);
    expect(wrapper.find('button[aria-label="Firefox auf macOS abmelden"]').exists()).toBe(false);
  });

  it("offers trusting this browser while it isn't trusted", async () => {
    server.answers["GET /api/v1/auth/sessions"] = { status: 200, body: { items: [] } };
    server.answers["GET /api/v1/me/trusted-devices"] = { status: 200, body: { items: [] } };
    server.answers["POST /api/v1/me/trusted-device"] = { status: 204 };
    const { wrapper } = await open(SecurityTab, "/konto/anmeldung");

    await wrapper.findAll("button").find((button) => button.text() === "Diesem Gerät vertrauen")!.trigger("click");
    await flushPromises();
    expect(server.calls.some((call) => call.method === "POST" && call.path === "/api/v1/me/trusted-device")).toBe(true);
  });

  it("changes the password and continues to the sign-in", async () => {
    server.answers["GET /api/v1/auth/sessions"] = { status: 200, body: { items: [] } };
    server.answers["GET /api/v1/me/trusted-devices"] = { status: 200, body: { items: [] } };
    server.answers["POST /api/v1/me/change-password"] = { status: 204 };
    const { wrapper, router } = await open(SecurityTab, "/konto/anmeldung");

    const fields = wrapper.findAll('input[autocomplete="current-password"], input[autocomplete="new-password"]');
    // Email section: current password; password section: current, new, repeat.
    await fields[1]!.setValue("altes-passwort");
    await fields[2]!.setValue("ein-langes-passwort");
    await fields[3]!.setValue("ein-langes-passwort");
    await wrapper.findAll("button").find((button) => button.text() === "Passwort ändern")!.trigger("click");
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login?passwordChanged=1"));

    expect(server.calls.find((call) => call.path === "/api/v1/me/change-password")?.body).toEqual({
      currentPassword: "altes-passwort",
      newPassword: "ein-langes-passwort",
    });
  });

  it("asks provider-only accounts for no password", async () => {
    server.answers["GET /api/v1/auth/sessions"] = { status: 200, body: { items: [] } };
    server.answers["GET /api/v1/me/trusted-devices"] = { status: 200, body: { items: [] } };
    server.answers["POST /api/v1/me/email-change"] = { status: 202, body: { pendingEmail: "neu@example.test", expiresAt: "2026-11-16T10:00:00Z" } };
    const { wrapper } = await open(SecurityTab, "/konto/anmeldung", { ...ME, signIn: { password: false, providers: ["GOOGLE"] } });

    expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Dein Konto hat kein Passwort");
    await wrapper.find('#email input[type="email"]').setValue("neu@example.test");
    await wrapper.findAll("button").find((button) => button.text() === "Bestätigungscode senden")!.trigger("click");
    await flushPromises();

    expect(server.calls.find((call) => call.path === "/api/v1/me/email-change")?.body).toEqual({ email: "neu@example.test" });
    expect(wrapper.text()).toContain("Wir haben einen Code an neu@example.test geschickt.");
  });
});
