import { flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The API client keeps the fetch it finds when it is created, so the fake server comes first.
const server = vi.hoisted(() => {
  const state = {
    answers: {} as Record<string, { status: number; body?: unknown }>,
    calls: [] as Array<{ method: string; path: string; query: string; body: unknown }>,
  };
  globalThis.fetch = (async (request: Request) => {
    const url = new URL(request.url);
    const text = await request.text();
    state.calls.push({ method: request.method, path: url.pathname, query: url.search, body: text ? JSON.parse(text) : null });
    const answer = state.answers[`${request.method} ${url.pathname}`] ?? {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "-" } },
    };
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
import { createMemoryHistory, createRouter, viewDepthKey } from "vue-router";

import { frontendModules } from "@/app/modules";
import { buildRoutes } from "@/app/router";
import { campaignKey, meKey } from "@/core/api/queryClient";
import MyInvitationsCard from "@/modules/campaign-invitations/components/MyInvitationsCard.vue";
import AcceptInvitationView from "@/modules/campaign-invitations/views/AcceptInvitationView.vue";
import InvitationsView from "@/modules/campaign-invitations/views/InvitationsView.vue";
import InviteView from "@/modules/campaign-invitations/views/InviteView.vue";

import { mountWithApp } from "../../helpers/mount";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SEGMENT = toRefSegment(CAMPAIGN_ID, "elaria");
const INVITATIONS = `/api/v1/campaigns/${CAMPAIGN_ID}/invitations`;
const INVITATION_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CAMPAIGN = {
  id: CAMPAIGN_ID,
  slug: "elaria",
  name: "Die Schatten von Elaria",
  role: "OWNER",
  effectivePermissions: ["campaigns.read", "campaignMembers.read", "campaignInvitations.read", "campaignInvitations.create", "campaignInvitations.revoke"],
};
const PENDING = {
  id: INVITATION_ID,
  email: "jonas@example.test",
  userTag: null,
  role: "PLAYER",
  status: "PENDING",
  expiresAt: "2026-11-26T10:00:00.000Z",
  createdAt: "2026-11-19T10:00:00.000Z",
};

async function open(component: Component, url: string, options: { me?: object | null; campaign?: object } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.me !== null) {
    queryClient.setQueryData(meKey("profile"), options.me ?? { displayName: "Jonas Weber", email: "jonas@example.test", userTag: "jonas#000002", systemRole: "USER", effectiveGlobalPermissions: [] });
  }
  queryClient.setQueryData(campaignKey(CAMPAIGN_ID, "detail"), options.campaign ?? CAMPAIGN);
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes(frontendModules) });
  await router.push(url);
  const host = document.createElement("div");
  host.id = "overlay-host";
  document.body.append(host);
  // In the app the list sits below the campaign shell, so its RouterView shows the editor (depth 2).
  const { wrapper } = await mountWithApp(component, {
    router,
    global: { plugins: [[VueQueryPlugin, { queryClient }]], provide: { [viewDepthKey as symbol]: 2 } },
  });
  await flushPromises();
  return { wrapper, router, queryClient };
}

const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((entry) => entry.textContent?.trim() === label);

afterEach(() => {
  server.calls.length = 0;
  server.answers = {};
  sessionStorage.clear();
  document.body.replaceChildren();
});

describe("campaign invitations (sharing page)", () => {
  it("shows the account of an invitation by user tag, never its address", async () => {
    server.answers[`GET ${INVITATIONS}`] = {
      status: 200,
      body: { data: [{ ...PENDING, email: null, userTag: "jonas#000002" }], pageInfo: { limit: 1, nextCursor: null, total: 1 } },
    };
    const { wrapper } = await open(InvitationsView, `/k/${SEGMENT}/freigaben/einladungen`);
    expect(wrapper.find("tbody tr").text()).toContain("jonas#000002");
    wrapper.unmount();
  });

  it("names an invitation whose account is gone", async () => {
    server.answers[`GET ${INVITATIONS}`] = {
      status: 200,
      body: { data: [{ ...PENDING, email: null, userTag: null }], pageInfo: { limit: 1, nextCursor: null, total: 1 } },
    };
    const { wrapper } = await open(InvitationsView, `/k/${SEGMENT}/freigaben/einladungen`);
    expect(wrapper.find("tbody tr").text()).toContain("Konto nicht mehr vorhanden");
    wrapper.unmount();
  });

  it("lists the pending invitations with role and dates", async () => {
    server.answers[`GET ${INVITATIONS}`] = { status: 200, body: { data: [PENDING], pageInfo: { limit: 1, nextCursor: null, total: 1 } } };
    const { wrapper } = await open(InvitationsView, `/k/${SEGMENT}/freigaben/einladungen`);
    const row = wrapper.find("tbody tr").text().replace(/\s+/g, " ");
    expect(row).toContain("jonas@example.test");
    expect(row).toContain("Spieler");
    expect(row).toContain("19.11.2026");
    expect(row).toContain("26.11.2026");
    expect(wrapper.findAll("a").map((link) => link.text())).toContain("Einladungen (1)");
    wrapper.unmount();
  });

  it("takes an invitation back after asking", async () => {
    server.answers[`GET ${INVITATIONS}`] = { status: 200, body: { data: [PENDING], pageInfo: { limit: 1, nextCursor: null, total: 1 } } };
    server.answers[`DELETE ${INVITATIONS}/${INVITATION_ID}`] = { status: 204 };
    const { wrapper } = await open(InvitationsView, `/k/${SEGMENT}/freigaben/einladungen`);
    await wrapper.find("tbody button[aria-haspopup=menu]").trigger("click");
    await flushPromises();
    [...document.body.querySelectorAll<HTMLButtonElement>("[role=menuitem]")][0]!.click();
    await flushPromises();
    expect(document.body.querySelector("[role=dialog]")?.textContent).toContain("Einladung an jonas@example.test gilt danach nicht mehr");
    [...document.body.querySelector("[role=dialog]")!.querySelectorAll<HTMLButtonElement>("button")]
      .find((entry) => entry.textContent?.trim() === "Zurückziehen")!
      .click();
    await flushPromises();
    expect(server.calls.some((call) => call.method === "DELETE" && call.path === `${INVITATIONS}/${INVITATION_ID}`)).toBe(true);
    wrapper.unmount();
  });
});

describe("inviting", () => {
  it("checks the address and sends the invitation, then returns to the list", async () => {
    server.answers[`POST ${INVITATIONS}`] = { status: 201, body: PENDING };
    const { wrapper, router } = await open(InviteView, `/k/${SEGMENT}/freigaben/einladungen/neu`);
    expect(document.body.textContent).toContain("Zur Kampagne Die Schatten von Elaria einladen");

    button("Einladung senden")!.click();
    await flushPromises();
    expect(document.body.textContent).toContain("Bitte gib eine gültige E-Mail-Adresse an.");
    expect(server.calls).toEqual([]);

    const email = document.body.querySelector<HTMLInputElement>("input[type=email]")!;
    email.value = " jonas@example.test ";
    email.dispatchEvent(new Event("input"));
    const selects = document.body.querySelectorAll<HTMLSelectElement>("select");
    selects[0]!.value = "EDITOR";
    selects[0]!.dispatchEvent(new Event("change"));
    await flushPromises();
    expect(document.body.textContent).toContain("Arbeitet an Welt und Inhalten mit");

    button("Einladung senden")!.click();
    await flushPromises();
    expect(server.calls.find((call) => call.method === "POST")).toMatchObject({
      path: INVITATIONS,
      body: { email: "jonas@example.test", role: "EDITOR", expiresInDays: 7 },
    });
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe("campaign-invitations"));
    wrapper.unmount();
  });

  it("finds an account by its user tag and invites it", async () => {
    server.answers[`GET ${INVITATIONS}/lookup`] = { status: 200, body: { userTag: "jonas#000002", displayName: "Jonas Weber" } };
    server.answers[`POST ${INVITATIONS}`] = { status: 201, body: { ...PENDING, userTag: "jonas#000002" } };
    const { wrapper } = await open(InviteView, `/k/${SEGMENT}/freigaben/einladungen/neu`);
    [...document.body.querySelectorAll<HTMLElement>("[role=radio], button")].find((entry) => entry.textContent?.trim() === "Benutzer-Tag")!.click();
    await flushPromises();
    const tag = document.body.querySelector<HTMLInputElement>("input:not([type=email])")!;
    tag.value = "jonas#000002";
    tag.dispatchEvent(new Event("input"));
    button("Prüfen")!.click();
    await flushPromises();
    expect(server.calls[0]).toMatchObject({ method: "GET", path: `${INVITATIONS}/lookup`, query: "?userTag=jonas%23000002" });
    expect(document.body.textContent).toContain("Gefunden: Jonas Weber");

    button("Einladung senden")!.click();
    await flushPromises();
    expect(server.calls.at(-1)).toMatchObject({ method: "POST", body: { userTag: "jonas#000002", role: "PLAYER" } });
    wrapper.unmount();
  });

  it("explains a refused invitation", async () => {
    server.answers[`POST ${INVITATIONS}`] = { status: 409, body: { error: { code: "CONFLICT", message: "-" } } };
    const { wrapper } = await open(InviteView, `/k/${SEGMENT}/freigaben/einladungen/neu`);
    const email = document.body.querySelector<HTMLInputElement>("input[type=email]")!;
    email.value = "jonas@example.test";
    email.dispatchEvent(new Event("input"));
    button("Einladung senden")!.click();
    await flushPromises();
    expect(document.body.textContent).toContain("schon eine offene Einladung, oder die Person ist bereits Mitglied");
    wrapper.unmount();
  });
});

describe("accepting from the email's link", () => {
  const TOKEN = "t".repeat(43);

  it("asks a visitor without a session to sign in, and keeps the token out of the address", async () => {
    server.answers["GET /api/v1/me"] = { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "-" } } };
    server.answers["POST /api/v1/auth/refresh"] = { status: 401, body: { error: { code: "UNAUTHENTICATED", message: "-" } } };
    const { wrapper, router } = await open(AcceptInvitationView, `/invitations/accept#token=${TOKEN}`, { me: null });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Melde dich an oder erstelle ein Konto"));
    expect(router.currentRoute.value.fullPath).toBe("/invitations/accept");
    expect(sessionStorage.getItem("questaria.invitation-token")).toBe(TOKEN);
    expect(wrapper.findAll("main a").map((link) => link.attributes("href"))).toEqual([
      "/login?redirect=/invitations/accept",
      "/registrieren?redirect=/invitations/accept",
    ]);
    wrapper.unmount();
  });

  it("accepts for the signed-in account and opens the campaign", async () => {
    sessionStorage.setItem("questaria.invitation-token", TOKEN);
    server.answers["POST /api/v1/invitations/accept"] = { status: 200, body: { campaignId: CAMPAIGN_ID, membershipId: INVITATION_ID, role: "PLAYER" } };
    server.answers[`GET /api/v1/campaigns/${CAMPAIGN_ID}`] = { status: 200, body: { ...CAMPAIGN, role: "PLAYER" } };
    const { wrapper, router, queryClient } = await open(AcceptInvitationView, "/invitations/accept");
    queryClient.removeQueries({ queryKey: campaignKey(CAMPAIGN_ID, "detail") });
    expect(document.body.textContent).toContain("Angemeldet als Jonas Weber (jonas@example.test).");
    button("Einladung annehmen")!.click();
    await flushPromises();
    expect(server.calls.find((call) => call.path === "/api/v1/invitations/accept")?.body).toEqual({ token: TOKEN });
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`/k/${SEGMENT}/spiel`));
    expect(sessionStorage.getItem("questaria.invitation-token")).toBeNull();
    wrapper.unmount();
  });

  it.each([
    [404, undefined, "gilt für eine andere E-Mail-Adresse", false],
    [409, { reason: "expired" }, "Diese Einladung ist abgelaufen.", true],
    [409, { reason: "changed" }, "gerade schon beantwortet oder zurückgezogen", true],
    [409, { reason: "member" }, "Du bist bereits Mitglied dieser Kampagne.", true],
    [403, { reason: "unverified" }, "Bestätige zuerst die E-Mail-Adresse", false],
  ])("says what to do when the backend answers %i %j, and forgets a token that is used up", async (status, details, text, forgotten) => {
    sessionStorage.setItem("questaria.invitation-token", TOKEN);
    server.answers["POST /api/v1/invitations/accept"] = { status, body: { error: { code: "X", message: "-", details } } };
    const { wrapper } = await open(AcceptInvitationView, "/invitations/accept");
    button("Einladung annehmen")!.click();
    await flushPromises();
    expect(document.body.textContent).toContain(text);
    expect(sessionStorage.getItem("questaria.invitation-token")).toBe(forgotten ? null : TOKEN);
    // A used-up token offers no second try.
    expect(button("Einladung annehmen") === undefined).toBe(forgotten);
    wrapper.unmount();
  });

  it.each([
    [409, { error: { code: "CONFLICT", message: "-" } }],
    [403, { error: { code: "FORBIDDEN", message: "-" } }],
  ])("reads only reasons the answer names: a %i without one is a general error and keeps the token", async (status, body) => {
    sessionStorage.setItem("questaria.invitation-token", TOKEN);
    server.answers["POST /api/v1/invitations/accept"] = { status, body };
    const { wrapper } = await open(AcceptInvitationView, "/invitations/accept");
    button("Einladung annehmen")!.click();
    await flushPromises();
    expect(document.body.textContent).not.toContain("gerade schon beantwortet");
    expect(document.body.textContent).not.toContain("Bestätige zuerst");
    expect(sessionStorage.getItem("questaria.invitation-token")).toBe(TOKEN);
    expect(button("Einladung annehmen")).toBeDefined();
    wrapper.unmount();
  });

  it("keeps the token after a 404 and offers to sign in with another account", async () => {
    sessionStorage.setItem("questaria.invitation-token", TOKEN);
    server.answers["POST /api/v1/invitations/accept"] = { status: 404, body: { error: { code: "NOT_FOUND", message: "-" } } };
    server.answers["POST /api/v1/auth/logout"] = { status: 204 };
    const { wrapper, router } = await open(AcceptInvitationView, "/invitations/accept");
    button("Einladung annehmen")!.click();
    await flushPromises();
    expect(button("Zum Dashboard")).toBeUndefined();
    button("Mit anderem Konto anmelden")!.click();
    await flushPromises();
    expect(server.calls.some((call) => call.path === "/api/v1/auth/logout")).toBe(true);
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/login?redirect=/invitations/accept"));
    expect(sessionStorage.getItem("questaria.invitation-token")).toBe(TOKEN);
    wrapper.unmount();
  });

  it("treats a damaged link like an incomplete one, never falls back to a stored token and clears the address", async () => {
    sessionStorage.setItem("questaria.invitation-token", "older-token-of-another-invitation");
    const { wrapper, router } = await open(AcceptInvitationView, "/invitations/accept#token=%E0%A4%A");
    expect(document.body.textContent).toContain("Dieser Link ist unvollständig.");
    expect(button("Einladung annehmen")).toBeUndefined();
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/invitations/accept"));
    expect(sessionStorage.getItem("questaria.invitation-token")).toBeNull();
    wrapper.unmount();
  });

  it("treats an empty token in the link like a damaged one", async () => {
    sessionStorage.setItem("questaria.invitation-token", "older-token-of-another-invitation");
    const { wrapper } = await open(AcceptInvitationView, "/invitations/accept#token=");
    expect(document.body.textContent).toContain("Dieser Link ist unvollständig.");
    await vi.waitFor(() => expect(sessionStorage.getItem("questaria.invitation-token")).toBeNull());
    wrapper.unmount();
  });

  it("explains an incomplete link", async () => {
    const { wrapper } = await open(AcceptInvitationView, "/invitations/accept");
    expect(document.body.textContent).toContain("Dieser Link ist unvollständig.");
    wrapper.unmount();
  });
});

describe("the account's own invitations (dashboard)", () => {
  const MINE = {
    invitationId: INVITATION_ID,
    campaignId: CAMPAIGN_ID,
    campaignName: "Die Schatten von Elaria",
    invitedByName: "Mira Falkenstein",
    role: "PLAYER",
    expiresAt: "2026-11-26T10:00:00.000Z",
    createdAt: "2026-11-19T10:00:00.000Z",
  };

  it("shows nothing while there is no invitation", async () => {
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [] } };
    const { wrapper } = await open(MyInvitationsCard, "/dashboard");
    expect(wrapper.text()).toBe("");
    wrapper.unmount();
  });

  it("accepts one and opens the campaign", async () => {
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [MINE] } };
    server.answers[`POST /api/v1/me/invitations/${INVITATION_ID}/accept`] = { status: 200, body: { campaignId: CAMPAIGN_ID, membershipId: INVITATION_ID, role: "PLAYER" } };
    server.answers[`GET /api/v1/campaigns/${CAMPAIGN_ID}`] = { status: 200, body: { ...CAMPAIGN, role: "PLAYER" } };
    const { wrapper, router, queryClient } = await open(MyInvitationsCard, "/dashboard");
    queryClient.removeQueries({ queryKey: campaignKey(CAMPAIGN_ID, "detail") });
    expect(wrapper.text()).toContain("Eine Einladung wartet");
    expect(wrapper.text()).toContain("Die Schatten von Elaria");
    expect(wrapper.text()).toContain("Von Mira Falkenstein · als Spieler");
    expect(wrapper.text()).toContain("Gültig bis 26.11.2026");
    await wrapper.findAll("button").find((entry) => entry.text() === "Annehmen")!.trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe(`/k/${SEGMENT}/spiel`));
    wrapper.unmount();
  });

  it("says when an invitation was taken back meanwhile and drops it from the list", async () => {
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [MINE] } };
    server.answers[`POST /api/v1/me/invitations/${INVITATION_ID}/accept`] = { status: 404, body: { error: { code: "NOT_FOUND", message: "-" } } };
    const { wrapper } = await open(MyInvitationsCard, "/dashboard");
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [] } };
    await wrapper.findAll("button").find((entry) => entry.text() === "Annehmen")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Diese Einladung gibt es nicht mehr");
    expect(wrapper.findAll("button").map((entry) => entry.text())).not.toContain("Annehmen");
    wrapper.unmount();
  });

  it("declines one and says so", async () => {
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [MINE] } };
    server.answers[`POST /api/v1/me/invitations/${INVITATION_ID}/decline`] = { status: 204 };
    const { wrapper } = await open(MyInvitationsCard, "/dashboard");
    server.answers["GET /api/v1/me/invitations"] = { status: 200, body: { data: [] } };
    await wrapper.findAll("button").find((entry) => entry.text() === "Ablehnen")!.trigger("click");
    await flushPromises();
    expect(server.calls.some((call) => call.method === "POST" && call.path.endsWith("/decline"))).toBe(true);
    expect(wrapper.text()).toContain("Einladung zu Die Schatten von Elaria abgelehnt.");
    wrapper.unmount();
  });
});
