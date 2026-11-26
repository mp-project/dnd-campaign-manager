import { toRefSegment } from "@dnd/contracts";
import { QueryClient } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";

const clerk = vi.hoisted(() => ({
  token: "token-1" as string | Error,
  listeners: new Set<(sessionId: string | null) => void>(),
}));
vi.mock("@/core/auth/clerk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/auth/clerk")>()),
  sessionToken: async () => {
    if (clerk.token instanceof Error) throw clerk.token;
    return clerk.token;
  },
  onClerkSessionChange: (listener: (sessionId: string | null) => void) => {
    clerk.listeners.add(listener);
    return () => clerk.listeners.delete(listener);
  },
}));

import { buildRoutes } from "@/app/router";
import { campaignKey } from "@/core/api/queryClient";
import { defineFrontendModule } from "@/core/modules";
import { startRealtime } from "@/core/realtime/connection";
import { CORE_REALTIME_HANDLERS, type RealtimeHandler } from "@/core/realtime/handlers";
import { realtimeCampaign, realtimeConnected } from "@/core/realtime/status";
import { authModule } from "@/modules/auth";

const CAMPAIGN_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const OTHER_ID = "4a2c3d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const page = { render: () => null };
const testModule = defineFrontendModule({
  name: "test",
  routes: {
    account: [{ path: "dashboard", name: "dashboard", component: page }],
    campaign: [{ path: "welt/orte", name: "locations", component: page }],
    player: [{ path: "", name: "player-overview", component: page }],
  },
});

type Listener = (...args: unknown[]) => void;

/** Stands in for a Socket.IO client socket; the test plays the server. */
class FakeSocket {
  connected = false;
  active = true;
  recovered = false;
  readonly listeners = new Map<string, Listener[]>();
  readonly sent: Array<{ event: string; args: unknown[] }> = [];
  connectCalls = 0;
  ackResults: Record<string, unknown> = { "campaign:join": { ok: true } };

  constructor(readonly options: { auth: (callback: (data: unknown) => void) => void }) {}

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.sent.push({ event, args });
    return this;
  }

  timeout() {
    return {
      emitWithAck: async (event: string, ...args: unknown[]) => {
        this.sent.push({ event, args });
        return this.ackResults[event];
      },
    };
  }

  connect() {
    this.connectCalls += 1;
  }

  disconnect() {
    this.connected = false;
  }

  removeAllListeners() {
    this.listeners.clear();
  }

  /** The server: connects (optionally as a recovered connection) or sends an event. */
  serverConnects(recovered = false) {
    this.connected = true;
    this.recovered = recovered;
    this.fire("connect");
  }

  fire(event: string, ...args: unknown[]) {
    if (event === "disconnect") this.connected = false;
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  sentEvents(event: string) {
    return this.sent.filter((entry) => entry.event === event).map((entry) => entry.args[0]);
  }
}

const sockets: FakeSocket[] = [];
const loadClient = async () =>
  ({
    io: (_url: string, options: FakeSocket["options"]) => {
      const socket = new FakeSocket(options);
      sockets.push(socket);
      return socket;
    },
  }) as unknown as typeof import("socket.io-client");

let stop: (() => void) | null = null;

async function setup(handlers: RealtimeHandler[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createRouter({ history: createMemoryHistory(), routes: buildRoutes([authModule, testModule]) });
  stop = startRealtime({ router, queryClient, handlers, loadClient, random: () => 0 });
  return { queryClient, router };
}

const campaignPath = (id: string) => `/k/${toRefSegment(id, "elaria")}/welt/orte`;

describe("realtime connection", () => {
  beforeEach(() => {
    sockets.length = 0;
    clerk.token = "token-1";
  });

  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
  });

  it("opens only on pages of the app, with the session token in the handshake", async () => {
    const { router } = await setup();

    await router.push("/login");
    await flushPromises();
    expect(sockets).toHaveLength(0);

    await router.push("/dashboard");
    await flushPromises();
    expect(sockets).toHaveLength(1);

    const auth = await new Promise((resolve) => sockets[0]!.options.auth(resolve));
    expect(auth).toEqual({ token: "token-1" });

    sockets[0]!.serverConnects();
    expect(realtimeConnected.value).toBe(true);
  });

  it("joins the campaign of the open page and leaves it when the page leaves it", async () => {
    const { router } = await setup();

    await router.push(campaignPath(CAMPAIGN_ID));
    await flushPromises();
    const socket = sockets[0]!;
    socket.serverConnects();
    await flushPromises();
    expect(socket.sentEvents("campaign:join")).toEqual([CAMPAIGN_ID]);
    expect(realtimeCampaign.value).toBe(CAMPAIGN_ID);

    await router.push(campaignPath(OTHER_ID));
    await flushPromises();
    expect(socket.sentEvents("campaign:leave")).toEqual([CAMPAIGN_ID]);
    expect(socket.sentEvents("campaign:join")).toEqual([CAMPAIGN_ID, OTHER_ID]);

    await router.push("/dashboard");
    await flushPromises();
    expect(socket.sentEvents("campaign:leave")).toEqual([CAMPAIGN_ID, OTHER_ID]);
  });

  it("runs the handlers of a changed resource and joins again after a membership change", async () => {
    const invalidate = vi.fn();
    const { router, queryClient } = await setup([...CORE_REALTIME_HANDLERS, { resource: "campaign-memberships", invalidate }]);
    const refetch = vi.spyOn(queryClient, "invalidateQueries");

    await router.push(campaignPath(CAMPAIGN_ID));
    await flushPromises();
    const socket = sockets[0]!;
    socket.serverConnects();
    await flushPromises();

    socket.fire("invalidate", { resource: "campaign-memberships", campaignId: CAMPAIGN_ID });
    socket.fire("invalidate", { resource: "campaign", campaignId: CAMPAIGN_ID });
    socket.fire("invalidate", { resource: "content-shares", campaignId: CAMPAIGN_ID });
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    await flushPromises();

    expect(invalidate.mock.calls[0]![0]).toEqual({ resource: "campaign-memberships", campaignId: CAMPAIGN_ID });
    expect(refetch).toHaveBeenCalledWith({ queryKey: campaignKey(CAMPAIGN_ID, "detail") });
    expect(socket.sentEvents("campaign:join")).toEqual([CAMPAIGN_ID, CAMPAIGN_ID]);
  });

  it("loads the campaign again when joining it is refused", async () => {
    const { router, queryClient } = await setup();
    const refetch = vi.spyOn(queryClient, "invalidateQueries");

    await router.push(campaignPath(CAMPAIGN_ID));
    await flushPromises();
    const socket = sockets[0]!;
    socket.ackResults["campaign:join"] = { ok: false, reason: "notFound" };
    socket.serverConnects();
    await flushPromises();

    expect(refetch).toHaveBeenCalledWith({ queryKey: campaignKey(CAMPAIGN_ID, "detail") });
    // Not joined: the page keeps its own minute check.
    expect(realtimeCampaign.value).toBeNull();
  });

  it("leaves campaigns again that the page left while disconnected", async () => {
    const { router } = await setup();

    await router.push(campaignPath(CAMPAIGN_ID));
    await flushPromises();
    const socket = sockets[0]!;
    socket.serverConnects();
    await flushPromises();
    socket.fire("disconnect", "transport close");

    await router.push(campaignPath(OTHER_ID));
    await flushPromises();
    socket.serverConnects(true);
    await flushPromises();

    expect(socket.sentEvents("campaign:leave")).toEqual([CAMPAIGN_ID]);
    expect(socket.sentEvents("campaign:join")).toEqual([CAMPAIGN_ID, OTHER_ID]);
  });

  it("hands an empty token to the handshake when Clerk fails, so the refusal is retried", async () => {
    const { router } = await setup();
    clerk.token = new Error("Clerk unreachable");

    await router.push("/dashboard");
    await flushPromises();
    const auth = await new Promise((resolve) => sockets[0]!.options.auth(resolve));

    expect(auth).toEqual({ token: "" });
  });

  it("loads everything again after a reconnect the server couldn't recover", async () => {
    const { router, queryClient } = await setup();
    const refetch = vi.spyOn(queryClient, "invalidateQueries");

    await router.push("/dashboard");
    await flushPromises();
    const socket = sockets[0]!;
    socket.serverConnects();
    socket.fire("disconnect", "transport close");
    expect(realtimeConnected.value).toBe(false);

    socket.serverConnects(true);
    expect(refetch).not.toHaveBeenCalled();

    socket.fire("disconnect", "transport close");
    socket.serverConnects(false);
    expect(refetch).toHaveBeenCalledWith();
  });

  it("swaps the token before it runs out", async () => {
    vi.useFakeTimers();
    const { router } = await setup();

    await router.push("/dashboard");
    await vi.runOnlyPendingTimersAsync();
    const socket = sockets[0]!;
    socket.serverConnects();
    socket.ackResults["auth:refresh"] = { ok: true, session: { expiresInSeconds: 60 } };
    socket.fire("session", { expiresInSeconds: 60 });
    clerk.token = "token-2";

    await vi.advanceTimersByTimeAsync(44_000);
    expect(socket.sentEvents("auth:refresh")).toEqual([]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sentEvents("auth:refresh")).toEqual(["token-2"]);
  });

  it("asks again soon when a refresh fails on the server's side", async () => {
    vi.useFakeTimers();
    const { router } = await setup();

    await router.push("/dashboard");
    await vi.runOnlyPendingTimersAsync();
    const socket = sockets[0]!;
    socket.serverConnects();
    socket.ackResults["auth:refresh"] = { ok: false };
    socket.fire("session", { expiresInSeconds: 20 });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.sentEvents("auth:refresh")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(socket.sentEvents("auth:refresh")).toHaveLength(2);
  });

  it("tries again with growing pauses when the server ends or refuses the connection", async () => {
    vi.useFakeTimers();
    const { router } = await setup();

    await router.push("/dashboard");
    await vi.runOnlyPendingTimersAsync();
    const socket = sockets[0]!;
    socket.serverConnects();
    socket.fire("disconnect", "io server disconnect");

    await vi.advanceTimersByTimeAsync(2_000);
    expect(socket.connectCalls).toBe(1);

    socket.active = false;
    socket.fire("connect_error", new Error("Not signed in"));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(socket.connectCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(socket.connectCalls).toBe(2);
  });

  it("closes the connection when the session ends and opens a new one for the next session", async () => {
    const { router } = await setup();

    await router.push("/dashboard");
    await flushPromises();
    sockets[0]!.serverConnects();

    clerk.listeners.forEach((listener) => listener(null));
    expect(realtimeConnected.value).toBe(false);
    expect(sockets[0]!.connected).toBe(false);

    clerk.listeners.forEach((listener) => listener("sess_2"));
    await flushPromises();
    expect(sockets).toHaveLength(2);
  });
});
