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

import { toRefSegment } from "@dnd/contracts";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { Component } from "vue";
import { createMemoryHistory, createRouter } from "vue-router";

import { buildRoutes } from "@/app/router";
import type { Campaign } from "@/core/campaign/campaign";
import { authModule } from "@/modules/auth";
import { campaignsModule } from "@/modules/campaigns";
import CampaignOverviewView from "@/modules/campaigns/views/CampaignOverviewView.vue";
import DashboardView from "@/modules/campaigns/views/DashboardView.vue";

import { mountWithApp } from "../../helpers/mount";

const RULESET = { id: "11111111-1111-4111-8111-111111111111", name: "D&D 5e (2024)", description: "SRD 5.2", status: "ACTIVE" };

function campaign(id: string, name: string, role: Campaign["role"]): Campaign {
  return {
    id,
    version: 1,
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
    deletedAt: null,
    createdBy: "u1",
    updatedBy: null,
    ownerUserId: "u1",
    rulesetId: RULESET.id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description: null,
    status: "ACTIVE",
    currentGameDay: 12,
    longRestCount: 3,
    settings: {},
    isOwner: role === "OWNER",
    role,
    effectivePermissions: [],
  };
}

const ELARIA = campaign("3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "Die Schatten von Elaria", "OWNER");
const NORDMARK = campaign("4a1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "Nordmark", "PLAYER");

async function open(component: Component, url: string, permissions: string[] = ["campaigns.create"]) {
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, campaignsModule]) });
  await router.push(url);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(["me", "profile"], { id: "u1", displayName: "Ada", effectiveGlobalPermissions: permissions });
  const { wrapper } = await mountWithApp(component, { router, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  await flushPromises();
  return { wrapper, router, queryClient };
}

afterEach(() => {
  server.answers = {};
  server.calls.length = 0;
  document.body.innerHTML = "";
});

describe("dashboard", () => {
  it("splits own and joined campaigns, filters and searches", async () => {
    server.answers["GET /api/v1/campaigns"] = { status: 200, body: { data: [ELARIA, NORDMARK], limit: 100, nextCursor: null, total: 2 } };
    server.answers["GET /api/v1/ruleset"] = { status: 200, body: { data: [RULESET], limit: 20, nextCursor: null, total: 1 } };
    const { wrapper } = await open(DashboardView, "/dashboard");

    expect(wrapper.find("#dashboard-owned").text()).toContain("(1)");
    expect(wrapper.find("#dashboard-joined").text()).toContain("(1)");
    expect(wrapper.text()).toContain("D&D 5e (2024)");
    const links = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(links).toContain(`/k/${toRefSegment(ELARIA.id, ELARIA.slug)}`);
    expect(links).toContain(`/k/${toRefSegment(NORDMARK.id, NORDMARK.slug)}/spiel`);

    await wrapper.find("#dashboard-filter").setValue("joined");
    expect(wrapper.find("#dashboard-owned").exists()).toBe(false);
    await wrapper.find("#dashboard-filter").setValue("all");
    await wrapper.find("#dashboard-search").setValue("zzz");
    expect(wrapper.text()).toContain("Keine Kampagne passt zu deiner Suche.");
  });

  it("welcomes accounts without campaigns and offers creating only with the right", async () => {
    server.answers["GET /api/v1/campaigns"] = { status: 200, body: { data: [], limit: 100, nextCursor: null, total: 0 } };
    server.answers["GET /api/v1/ruleset"] = { status: 200, body: { data: [RULESET], limit: 20, nextCursor: null, total: 1 } };
    const allowed = await open(DashboardView, "/dashboard");
    expect(allowed.wrapper.text()).toContain("Willkommen in deiner Chronik");
    expect(allowed.wrapper.findAll("button").some((button) => button.text() === "Kampagne erstellen")).toBe(true);
    allowed.wrapper.unmount();

    const notAllowed = await open(DashboardView, "/dashboard", []);
    expect(notAllowed.wrapper.findAll("button").some((button) => button.text() === "Kampagne erstellen")).toBe(false);
  });

  it("creates a campaign and opens it", async () => {
    const created = campaign("5b1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "Der Kupferkrug", "OWNER");
    server.answers["GET /api/v1/campaigns"] = { status: 200, body: { data: [], limit: 100, nextCursor: null, total: 0 } };
    server.answers["GET /api/v1/ruleset"] = { status: 200, body: { data: [RULESET], limit: 20, nextCursor: null, total: 1 } };
    server.answers["POST /api/v1/campaigns"] = { status: 201, body: created };
    const { wrapper, router } = await open(DashboardView, "/dashboard");

    await wrapper.findAll("button").find((button) => button.text() === "Kampagne erstellen")!.trigger("click");
    await flushPromises();
    const dialog = document.querySelector('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')!;
    name.value = "  Der Kupferkrug ";
    name.dispatchEvent(new Event("input"));
    dialog.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit"));
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`/k/${toRefSegment(created.id, created.slug)}`));

    // The only ruleset is chosen by itself.
    expect(server.calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Der Kupferkrug", rulesetId: RULESET.id });
  });
});

describe("campaign overview", () => {
  it("shows ruleset, role, the active members and the campaign's state", async () => {
    const segment = toRefSegment(ELARIA.id, ELARIA.slug);
    server.answers[`GET /api/v1/campaigns/${ELARIA.id}`] = { status: 200, body: ELARIA };
    server.answers["GET /api/v1/ruleset"] = { status: 200, body: { data: [RULESET], limit: 20, nextCursor: null, total: 1 } };
    server.answers[`GET /api/v1/campaigns/${ELARIA.id}/members`] = {
      status: 200,
      body: {
        data: [
          { id: "m1", userTag: "mara#000001", displayName: "Mara Lichtwacht", role: "PLAYER", status: "ACTIVE", joinedAt: null, version: 1 },
          { id: "m2", userTag: "rovan#000002", displayName: "Rovan", role: "PLAYER", status: "REVOKED", joinedAt: null, version: 1 },
        ],
      },
    };
    const { wrapper } = await open(CampaignOverviewView, `/k/${segment}`);

    expect(wrapper.find("h1").text()).toBe("Die Schatten von Elaria");
    expect(wrapper.text()).toContain("Kampagne · D&D 5e (2024)");
    expect(wrapper.text()).toContain("Spielleitung");
    expect(wrapper.text()).toContain("Mara Lichtwacht");
    expect(wrapper.text()).not.toContain("Rovan");
    expect(wrapper.text()).toContain("12");
  });
});
