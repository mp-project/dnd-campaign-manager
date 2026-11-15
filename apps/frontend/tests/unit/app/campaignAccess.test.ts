import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
const server = vi.hoisted(() => {
  const state = { campaign: { status: 200, role: "OWNER" as string | null }, calls: [] as string[] };
  globalThis.fetch = (async (request: Request) => {
    const path = new URL(request.url).pathname;
    state.calls.push(path);
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (path.endsWith("/me")) return json(200, { id: "u1", systemRole: "USER", effectiveGlobalPermissions: [] });
    if (/\/campaigns\/[^/]+$/.test(path)) {
      return state.campaign.status === 200
        ? json(200, { id: "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f", slug: "elaria", role: state.campaign.role, effectivePermissions: [] })
        : json(state.campaign.status, { error: { code: "NOT_FOUND", message: "gone" } });
    }
    return json(403, { error: { code: "FORBIDDEN", message: "no" } });
  }) as typeof fetch;
  return state;
});

import { toRefSegment } from "@dnd/contracts";
import { QueryClient } from "@tanstack/vue-query";
import { createMemoryHistory, createRouter } from "vue-router";

import { watchCampaignAccess } from "@/app/campaignAccess";
import { installGuards } from "@/app/guards";
import { buildRoutes } from "@/app/router";
import { api, unwrap } from "@/core/api/client";
import { campaignKey } from "@/core/api/queryClient";
import { lastCampaignId, rememberCampaign } from "@/core/campaign/campaign";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SEGMENT = toRefSegment(CAMPAIGN_ID, "elaria");
const page = { render: () => null };
const testModule = defineFrontendModule({
  name: "test",
  routes: {
    account: [{ path: "dashboard", name: "dashboard", component: page }],
    campaign: [{ path: "welt/orte", name: "locations", component: page }],
    player: [{ path: "", name: "player-overview", component: page }],
  },
});

async function openCampaign() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, testModule]) });
  installGuards(router, queryClient);
  const stop = watchCampaignAccess(router, queryClient);
  await router.push(`/k/${SEGMENT}/welt/orte`);
  // Something loaded with the game master's rights.
  queryClient.setQueryData(campaignKey(CAMPAIGN_ID, "locations"), [{ id: "gm-only" }]);
  return { queryClient, router, stop };
}

/** What the minute check or a navigation does: load the campaign again. */
const reloadCampaign = (queryClient: QueryClient) =>
  queryClient.refetchQueries({ queryKey: campaignKey(CAMPAIGN_ID, "detail") }).catch(() => undefined);

describe("role and access changes while the app is open", () => {
  afterEach(() => {
    server.campaign = { status: 200, role: "OWNER" };
    server.calls.length = 0;
    rememberCampaign(null);
  });

  it("sends somebody who became a player to the player view and drops the old data", async () => {
    const { queryClient, router, stop } = await openCampaign();
    expect(router.currentRoute.value.name).toBe("locations");

    server.campaign.role = "PLAYER";
    await reloadCampaign(queryClient);
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`/k/${SEGMENT}/spiel`));
    expect(queryClient.getQueryData(campaignKey(CAMPAIGN_ID, "locations"))).toBeUndefined();
    stop();
  });

  it("shows not found and forgets the campaign when the membership ended", async () => {
    const { queryClient, router, stop } = await openCampaign();
    expect(lastCampaignId.value).toBe(CAMPAIGN_ID);

    server.campaign = { status: 404, role: null };
    await reloadCampaign(queryClient);
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe("not-found"));
    expect(router.currentRoute.value.path).toBe(`/k/${SEGMENT}/welt/orte`);
    expect(lastCampaignId.value).toBeNull();
    stop();
  });

  it("checks the campaign again right away when the API refuses its content", async () => {
    const { queryClient, stop } = await openCampaign();
    server.calls.length = 0;

    await queryClient
      .fetchQuery({
        queryKey: campaignKey(CAMPAIGN_ID, "notes"),
        queryFn: () => unwrap(api.GET("/api/v1/campaigns/{campaignId}/members", { params: { path: { campaignId: CAMPAIGN_ID } } })),
      })
      .catch(() => undefined);
    await flushPromises();
    await vi.waitFor(() => expect(server.calls.some((path) => path.endsWith(`/campaigns/${CAMPAIGN_ID}`))).toBe(true));
    stop();
  });
});
