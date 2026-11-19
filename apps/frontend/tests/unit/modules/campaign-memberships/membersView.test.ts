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
import { createMemoryHistory, createRouter } from "vue-router";

import { frontendModules } from "@/app/modules";
import { buildRoutes } from "@/app/router";
import { campaignKey, meKey } from "@/core/api/queryClient";
import { valueEditor } from "@/core/ui/valueEditor";
import MembersView from "@/modules/campaign-memberships/views/MembersView.vue";

import { mountWithApp } from "../../helpers/mount";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const SEGMENT = toRefSegment(CAMPAIGN_ID, "elaria");
const MEMBERS = `/api/v1/campaigns/${CAMPAIGN_ID}/members`;
const OWNER_PERMISSIONS = [
  "campaigns.read",
  "campaignMembers.read",
  "campaignMembers.updateRole",
  "campaignMembers.revoke",
  "campaignInvitations.read",
  "campaignInvitations.create",
  "campaignInvitations.revoke",
];

const member = (id: string, displayName: string, userTag: string, role: "EDITOR" | "PLAYER", isOwner = false) => ({
  id,
  userTag,
  displayName,
  role,
  status: "ACTIVE",
  joinedAt: "2026-10-01T10:00:00.000Z",
  version: 3,
  isOwner,
});
const OWNER = member("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Mira Falkenstein", "mira#000001", "EDITOR", true);
const PLAYER = member("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Jonas Weber", "jonas#000002", "PLAYER");

const OWNER_OTHER = member("dddddddd-dddd-4ddd-8ddd-dddddddddddd", "Ada Lindqvist", "ada#000009", "EDITOR", true);

async function open(options: { permissions?: string[]; members?: object[] } = {}) {
  const rows = options.members ?? [OWNER, PLAYER];
  server.answers[`GET ${MEMBERS}`] = { status: 200, body: { data: rows, pageInfo: { limit: rows.length, nextCursor: null, total: rows.length } } };
  const queryClient = new QueryClient();
  queryClient.setQueryData(meKey("profile"), { userTag: "mira#000001", systemRole: "USER", effectiveGlobalPermissions: [] });
  queryClient.setQueryData(campaignKey(CAMPAIGN_ID, "detail"), {
    id: CAMPAIGN_ID,
    slug: "elaria",
    name: "Die Schatten von Elaria",
    role: "OWNER",
    effectivePermissions: options.permissions ?? OWNER_PERMISSIONS,
  });
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes(frontendModules) });
  await router.push(`/k/${SEGMENT}/freigaben`);
  const { wrapper } = await mountWithApp(MembersView, { router, global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  await flushPromises();
  return { wrapper, router };
}

const rowTexts = (wrapper: Awaited<ReturnType<typeof open>>["wrapper"]) =>
  wrapper.findAll("tbody tr").map((row) => row.text().replace(/\s+/g, " ").trim());

afterEach(() => {
  server.calls.length = 0;
  server.answers = {};
  valueEditor.open = false;
  document.body.innerHTML = "";
});

describe("campaign members (sharing page)", () => {
  it("lists the members with the game master's crown, the viewer and since when", async () => {
    const { wrapper } = await open();
    expect(wrapper.find("h1").text()).toBe("Freigaben");
    const rows = rowTexts(wrapper);
    expect(rows[0]).toContain("Mira Falkenstein (Du)");
    expect(rows[0]).toContain("Spielleitung");
    expect(rows[1]).toContain("Jonas Weber");
    expect(rows[1]).toContain("Spieler");
    expect(rows[1]).toContain("01.10.2026");
    // Tabs with their own address and the one primary action.
    const links = wrapper.findAll("a").map((link) => [link.text(), link.attributes("href")]);
    expect(links).toEqual(
      expect.arrayContaining([
        ["Mitglieder (2)", `/k/${SEGMENT}/freigaben`],
        ["Einladungen", `/k/${SEGMENT}/freigaben/einladungen`],
        ["Spieler einladen", `/k/${SEGMENT}/freigaben/einladungen/neu`],
      ]),
    );
    wrapper.unmount();
  });

  it("changes a member's role in the value editor, with the version against lost updates", async () => {
    const { wrapper } = await open();
    // The owner's role is fixed; the player's opens the value editor.
    const editable = wrapper.findAll("tbody tr").map((row) => row.find("[aria-label^='Rolle von']").exists());
    expect(editable).toEqual([false, true]);
    await wrapper.findAll("tbody tr")[1]!.find("[aria-label^='Rolle von']").trigger("click");
    expect(valueEditor.open).toBe(true);
    expect(valueEditor.title).toBe("Rolle von Jonas Weber");
    expect(valueEditor.fields[0]).toMatchObject({ type: "select", value: "PLAYER" });

    server.answers[`PATCH ${MEMBERS}/${PLAYER.id}`] = { status: 200, body: { id: PLAYER.id, role: "EDITOR", status: "ACTIVE", joinedAt: null, version: 4, merged: [] } };
    await valueEditor.onSave!({ role: "EDITOR" });
    expect(server.calls.find((call) => call.method === "PATCH")).toEqual({
      method: "PATCH",
      path: `${MEMBERS}/${PLAYER.id}`,
      body: { role: "EDITOR", expectedVersion: 3 },
    });
    // The list is fetched again.
    expect(server.calls.filter((call) => call.method === "GET" && call.path === MEMBERS).length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it("loads the list again after a version conflict, so the next try starts from what is current", async () => {
    const { wrapper } = await open();
    await wrapper.findAll("tbody tr")[1]!.find("[aria-label^='Rolle von']").trigger("click");
    const before = server.calls.filter((call) => call.method === "GET" && call.path === MEMBERS).length;
    server.answers[`PATCH ${MEMBERS}/${PLAYER.id}`] = {
      status: 412,
      body: { error: { code: "VERSION_CONFLICT", message: "-", details: { currentVersion: 4 } } },
    };
    await expect(valueEditor.onSave!({ role: "EDITOR" })).rejects.toMatchObject({ status: 412 });
    expect(server.calls.filter((call) => call.method === "GET" && call.path === MEMBERS).length).toBe(before + 1);
    wrapper.unmount();
  });

  it("loads the campaign again after changing the own role, so rights and area follow", async () => {
    const coAuthor = member("cccccccc-cccc-4ccc-8ccc-cccccccccccc", "Mira Falkenstein", "mira#000001", "EDITOR");
    const { wrapper } = await open({ members: [OWNER_OTHER, coAuthor] });
    server.answers[`PATCH ${MEMBERS}/${coAuthor.id}`] = { status: 200, body: { id: coAuthor.id, role: "PLAYER", status: "ACTIVE", joinedAt: null, version: 4, merged: [] } };
    server.answers[`GET /api/v1/campaigns/${CAMPAIGN_ID}`] = { status: 200, body: { id: CAMPAIGN_ID, slug: "elaria", role: "PLAYER", effectivePermissions: [] } };
    await wrapper.findAll("tbody tr")[1]!.find("[aria-label^='Rolle von']").trigger("click");
    await valueEditor.onSave!({ role: "PLAYER" });
    await flushPromises();
    expect(server.calls.some((call) => call.method === "GET" && call.path === `/api/v1/campaigns/${CAMPAIGN_ID}`)).toBe(true);
    wrapper.unmount();
  });

  it("removes a member after asking; the game master can't be removed", async () => {
    const { wrapper } = await open();
    const menus = wrapper.findAll("tbody tr").map((row) => row.find("button[aria-haspopup=menu]").exists());
    expect(menus).toEqual([false, true]);

    await wrapper.findAll("tbody tr")[1]!.find("button[aria-haspopup=menu]").trigger("click");
    await flushPromises();
    const remove = [...document.body.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].find(
      (item) => item.textContent?.trim() === "Aus der Kampagne entfernen",
    )!;
    remove.click();
    await flushPromises();
    const dialog = document.body.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain("Jonas Weber entfernen?");
    expect(dialog.textContent).toContain("verliert den Zugang");

    server.answers[`DELETE ${MEMBERS}/${PLAYER.id}`] = { status: 204 };
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Entfernen")!.click();
    await flushPromises();
    expect(server.calls.some((call) => call.method === "DELETE" && call.path === `${MEMBERS}/${PLAYER.id}`)).toBe(true);
    expect(document.body.querySelector("[role=dialog]")).toBeNull();
    wrapper.unmount();
  });

  it("shows the reason when the API refuses to remove", async () => {
    const { wrapper } = await open();
    await wrapper.findAll("tbody tr")[1]!.find("button[aria-haspopup=menu]").trigger("click");
    await flushPromises();
    [...document.body.querySelectorAll<HTMLButtonElement>("[role=menuitem]")].at(-1)!.click();
    await flushPromises();
    server.answers[`DELETE ${MEMBERS}/${PLAYER.id}`] = { status: 409, body: { error: { code: "CONFLICT", message: "-" } } };
    const dialog = document.body.querySelector("[role=dialog]")!;
    [...dialog.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.trim() === "Entfernen")!.click();
    await flushPromises();
    expect(document.body.querySelector("[role=dialog]")?.querySelector("[role=alert], [aria-live]")).not.toBeNull();
    wrapper.unmount();
  });

  it("leaves out what a co-author may not do: invitations, inviting", async () => {
    const { wrapper } = await open({ permissions: ["campaigns.read", "campaignMembers.read", "campaignMembers.updateRole", "campaignMembers.revoke"] });
    const labels = wrapper.findAll("a").map((link) => link.text());
    expect(labels).toContain("Mitglieder (2)");
    expect(labels).not.toContain("Einladungen");
    expect(labels).not.toContain("Spieler einladen");
    wrapper.unmount();
  });
});
