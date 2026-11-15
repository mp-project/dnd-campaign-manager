import { toRefSegment } from "@dnd/contracts";
import { QueryClient } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

import { handleSessionExpired, installGuards } from "@/app/guards";
import { buildRoutes } from "@/app/router";
import { ApiError } from "@/core/api/errors";
import { lastCampaignId, rememberCampaign } from "@/core/campaign/campaign";
import { defineFrontendModule } from "@/core/modules";
import { authModule } from "@/modules/auth";

const page = { render: () => null };
const testModule = defineFrontendModule({
  name: "test",
  routes: {
    account: [{ path: "dashboard", name: "dashboard", component: page }],
    campaign: [
      { path: "", name: "overview", component: page },
      { path: "welt/orte", name: "locations", component: page },
    ],
    player: [{ path: "", name: "player-overview", component: page }],
  },
});

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SEGMENT = toRefSegment(CAMPAIGN_ID, "die-schatten-von-elaria");

function apiError(status: number): ApiError {
  return new ApiError({ status, code: status === 401 ? "UNAUTHENTICATED" : "NOT_FOUND", message: "test" });
}

function setup(answers: { me?: unknown; campaign?: unknown }) {
  const queryClient = new QueryClient();
  vi.spyOn(queryClient, "ensureQueryData").mockImplementation(async (options) => {
    const { queryKey } = options as { queryKey: readonly unknown[] };
    const answer = queryKey[0] === "me" ? answers.me : answers.campaign;
    if (answer instanceof Error) throw answer;
    return answer;
  });
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, testModule]) });
  installGuards(router, queryClient);
  return router;
}

const me = { id: "u1", displayName: "Mara", systemRole: "USER" };
const campaign = (role: string | null) => ({ id: CAMPAIGN_ID, slug: "die-schatten-von-elaria", role });

describe("route guards", () => {
  beforeEach(() => rememberCampaign(null));

  it("sends visitors without a session to the sign-in and back afterwards", async () => {
    const router = setup({ me: apiError(401) });
    await router.push("/dashboard?tab=1");
    expect(router.currentRoute.value.name).toBe("auth-login");
    expect(router.currentRoute.value.query.redirect).toBe("/dashboard?tab=1");
  });

  it("opens the campaign in the URL and remembers it", async () => {
    const router = setup({ me, campaign: campaign("OWNER") });
    await router.push(`/k/${SEGMENT}/welt/orte`);
    expect(router.currentRoute.value.name).toBe("locations");
    expect(lastCampaignId.value).toBe(CAMPAIGN_ID);
  });

  it("corrects a wrong or missing slug in place, keeping the rest of the address", async () => {
    const router = setup({ me, campaign: campaign("OWNER") });
    await router.push(`/k/${toRefSegment(CAMPAIGN_ID, "alter-name")}/welt/orte?seite=2#liste`);
    expect(router.currentRoute.value.fullPath).toBe(`/k/${SEGMENT}/welt/orte?seite=2#liste`);
    await router.push(`/k/${toRefSegment(CAMPAIGN_ID)}`);
    expect(router.currentRoute.value.path).toBe(`/k/${SEGMENT}`);
  });

  it("shows not found for invalid short ids and campaigns the account can't see", async () => {
    const invalid = setup({ me, campaign: campaign("OWNER") });
    await invalid.push("/k/kupferkrug/welt/orte");
    expect(invalid.currentRoute.value.name).toBe("not-found");
    expect(invalid.currentRoute.value.path).toBe("/k/kupferkrug/welt/orte");

    rememberCampaign(CAMPAIGN_ID);
    const hidden = setup({ me, campaign: apiError(404) });
    await hidden.push(`/k/${SEGMENT}`);
    expect(hidden.currentRoute.value.name).toBe("not-found");
    expect(lastCampaignId.value).toBeNull();
  });

  it("gives players the player view, while the game master may open it as well", async () => {
    const player = setup({ me, campaign: campaign("PLAYER") });
    await player.push(`/k/${SEGMENT}/welt/orte`);
    expect(player.currentRoute.value.path).toBe(`/k/${SEGMENT}/spiel`);

    const owner = setup({ me, campaign: campaign("OWNER") });
    await owner.push(`/k/${SEGMENT}/spiel`);
    expect(owner.currentRoute.value.name).toBe("player-overview");
  });

  it("sends to the sign-in when the session ends while the campaign loads", async () => {
    const router = setup({ me, campaign: apiError(401) });
    await router.push(`/k/${SEGMENT}/welt/orte`);
    expect(router.currentRoute.value.name).toBe("auth-login");
    expect(router.currentRoute.value.query.redirect).toBe(`/k/${SEGMENT}/welt/orte`);
  });

  it("keeps administrators who also play in the campaign area (the API shows them everything)", async () => {
    const router = setup({ me: { ...me, systemRole: "ADMIN" }, campaign: campaign("PLAYER") });
    await router.push(`/k/${SEGMENT}/welt/orte`);
    expect(router.currentRoute.value.name).toBe("locations");
  });

  it("lets pages show their own error state when the network fails", async () => {
    const router = setup({ me, campaign: new ApiError({ status: 0, code: "NETWORK_ERROR", message: "offline" }) });
    await router.push(`/k/${SEGMENT}`);
    expect(router.currentRoute.value.name).toBe("overview");
  });
});

describe("expired session", () => {
  afterEach(() => vi.useRealTimers());

  it("leaves a guarded page for the sign-in and comes back afterwards", async () => {
    const router = setup({ me });
    await router.push("/dashboard");
    handleSessionExpired(router, new QueryClient());
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe("auth-login"));
    expect(router.currentRoute.value.query.redirect).toBe("/dashboard");
  });

  it("lets requests that failed with it settle before the cache is cleared", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, testModule]) });
    let expire = () => {};
    const loading = queryClient.fetchQuery({
      queryKey: ["me", "campaigns"],
      queryFn: () =>
        new Promise((_, reject) => {
          expire = () => {
            // What authFetch does: report the expired session, then hand the 401 to the caller.
            handleSessionExpired(router, queryClient);
            reject(apiError(401));
          };
        }),
    });
    await vi.advanceTimersByTimeAsync(0);
    expire();

    await expect(loading).rejects.toMatchObject({ status: 401 });
    expect(queryClient.getQueryState(["me", "campaigns"])?.status).toBe("error");
    await vi.advanceTimersByTimeAsync(0);
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
