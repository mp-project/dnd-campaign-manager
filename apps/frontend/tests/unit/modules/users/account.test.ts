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

vi.mock("@clerk/vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    UserProfile: defineComponent({
      inheritAttrs: false,
      setup: (_props, { attrs }) => () => h("div", { "data-clerk": "UserProfile", "data-path": attrs.path }),
    }),
  };
});
vi.mock("@/core/auth/clerk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/auth/clerk")>()),
  loadClerk: async () => ({ session: { id: "sess_1" } }),
}));

import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import type { Me } from "@/core/auth/session";
import { authModule } from "@/modules/auth";
import { legalModule } from "@/modules/legal";
import { usersModule } from "@/modules/users";
import AppearanceTab from "@/modules/users/views/AppearanceTab.vue";
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
  settings: { locale: "de", timezone: "Europe/Berlin", reducedMotion: false, fontScale: 100, sidebarCollapsed: false },
  effectiveGlobalPermissions: [],
};

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
  it("shows Clerk's account view, with its own steps below the tab", async () => {
    const { wrapper, router } = await open(SecurityTab, "/konto/anmeldung/security");

    expect(router.currentRoute.value.name).toBe("account-security");
    expect(wrapper.find("[data-clerk=UserProfile]").attributes("data-path")).toBe("/konto/anmeldung");
  });
});

describe("appearance", () => {
  it("saves text size and sidebar together and keeps the answer as the profile", async () => {
    server.answers["PATCH /api/v1/me/settings"] = {
      status: 200,
      body: { ...ME, settings: { ...ME.settings, fontScale: 115, sidebarCollapsed: true } },
    };
    const { wrapper, queryClient } = await open(AppearanceTab, "/konto/darstellung");

    await wrapper.find('input[type="range"]').setValue("115");
    await wrapper.find('[role="switch"]').trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(server.calls).toEqual([
      { method: "PATCH", path: "/api/v1/me/settings", body: { fontScale: 115, sidebarCollapsed: true } },
    ]);
    expect((queryClient.getQueryData(["me", "profile"]) as Me).settings.fontScale).toBe(115);
    expect(wrapper.find('[role="status"]').text()).toBe("Deine Darstellung ist gespeichert.");
  });

  it("previews the chosen size relative to the saved one", async () => {
    const { wrapper } = await open(AppearanceTab, "/konto/darstellung", {
      ...ME,
      settings: { ...ME.settings, fontScale: 110 },
    });

    await wrapper.find('input[type="range"]').setValue("110");
    expect(wrapper.find("figure p").attributes("style")).toContain("font-size: 1rem");

    await wrapper.find('input[type="range"]').setValue("121");
    expect(wrapper.find("figure p").attributes("style")).toContain("font-size: 1.1rem");
  });
});
