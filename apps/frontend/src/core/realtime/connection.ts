import {
  type CampaignJoinResult,
  type InvalidateMessage,
  REALTIME_PATH,
  type RealtimeClientToServerEvents,
  type RealtimeServerToClientEvents,
  type RealtimeSession,
} from "@dnd/contracts";
import type { QueryClient } from "@tanstack/vue-query";
import type { Socket } from "socket.io-client";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";

import { apiOrigin } from "@/core/api/client";
import { campaignKey } from "@/core/api/queryClient";
import { onClerkSessionChange, sessionToken } from "@/core/auth/clerk";
import { campaignIdOfParam } from "@/core/campaign/campaign";
import { logger } from "@/core/log";
import { dispatchInvalidate, type RealtimeHandler } from "@/core/realtime/handlers";
import { setRealtimeCampaign, setRealtimeConnected } from "@/core/realtime/status";

type RealtimeSocket = Socket<RealtimeServerToClientEvents, RealtimeClientToServerEvents>;

/** Areas of the app that have a session; public pages never open the channel. */
const APP_AREAS = new Set(["account", "campaign", "player"]);

/** A changed resource is loaded again a little later in each browser, so a room doesn't ask at once. */
const RELOAD_JITTER_MS = 400;

/** The token is swapped this long before it runs out. */
const REFRESH_AHEAD_SECONDS = 15;

const RETRY_MIN_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const ACK_TIMEOUT_MS = 5_000;

export type RealtimeOptions = {
  router: Router;
  queryClient: QueryClient;
  handlers: readonly RealtimeHandler[];
  /** Replaced in tests. */
  loadClient?: () => Promise<typeof import("socket.io-client")>;
  random?: () => number;
};

function campaignOf(route: RouteLocationNormalizedLoaded): string | null {
  return route.meta.area === "campaign" || route.meta.area === "player"
    ? campaignIdOfParam(route.params.campaign)
    : null;
}

function realtimeUrl(): string {
  return apiOrigin(import.meta.env.VITE_API_BASE_URL ?? "/api/v1") || window.location.origin;
}

/**
 * The realtime channel (Socket.IO to the realtime gateway). It opens once a page of the app is
 * shown (Socket.IO loads then, never on public pages) and closes when the session ends:
 * - the handshake and every reconnect take a fresh session token; before it runs out the token is
 *   swapped (`auth:refresh`);
 * - the campaign of the open page is joined, and left when the page leaves it;
 * - `invalidate` runs the handlers of its resource after a small random delay;
 * - after an interruption the server delivers what was missed (recovery); when it can't, every
 *   active query is loaded again;
 * - a connection the server ended or refused is tried again with growing pauses.
 * Returns a function that stops it.
 */
export function startRealtime(options: RealtimeOptions): () => void {
  const { router, queryClient, handlers } = options;
  const random = options.random ?? Math.random;
  const loadClient = options.loadClient ?? (() => import("socket.io-client"));

  let socket: RealtimeSocket | null = null;
  let opening: Promise<void> | null = null;
  let joinedCampaign: string | null = null;
  // Left while disconnected: a recovered connection gets the old rooms back, so they are left again.
  const leftWhileAway = new Set<string>();
  let connectedBefore = false;
  let retryMs = RETRY_MIN_MS;
  let retryTimer: number | undefined;
  let refreshTimer: number | undefined;
  let stopped = false;

  function clearTimers(): void {
    window.clearTimeout(retryTimer);
    window.clearTimeout(refreshTimer);
    retryTimer = undefined;
    refreshTimer = undefined;
  }

  function retryLater(): void {
    if (stopped || retryTimer !== undefined) return;
    const delay = retryMs;
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    retryTimer = window.setTimeout(() => {
      retryTimer = undefined;
      socket?.connect();
    }, delay);
  }

  function scheduleRefresh(session: RealtimeSession): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
    if (session.expiresInSeconds === null) return;

    const seconds = Math.max(5, session.expiresInSeconds - REFRESH_AHEAD_SECONDS);
    refreshTimer = window.setTimeout(() => void refresh(), seconds * 1000);
  }

  /** Tries the refresh again soon; the old token keeps its grace period meanwhile. */
  const retryRefresh = () => scheduleRefresh({ expiresInSeconds: REFRESH_AHEAD_SECONDS + 5 });

  async function refresh(): Promise<void> {
    const current = socket;
    let token: string | null;
    try {
      token = await sessionToken({ fresh: true });
    } catch (error) {
      // Clerk not reachable right now; the API's requests will notice a really ended session.
      logger.warn("Realtime token refresh: no fresh token", { error: String(error) });
      retryRefresh();
      return;
    }
    if (!current?.connected || !token) return;

    try {
      const result = await current.timeout(ACK_TIMEOUT_MS).emitWithAck("auth:refresh", token);
      // Refused for this account, the server ends the connection; a failure on its side answers
      // `ok: false` with the connection kept, so it is asked again.
      if (result.ok) scheduleRefresh(result.session);
      else retryRefresh();
    } catch {
      // No answer in time.
      retryRefresh();
    }
  }

  async function join(campaignId: string): Promise<void> {
    const current = socket;
    if (!current?.connected) return;

    let result: CampaignJoinResult;
    try {
      result = await current.timeout(ACK_TIMEOUT_MS).emitWithAck("campaign:join", campaignId);
    } catch {
      // Without an answer the page still has its own checks; the next connect joins again.
      return;
    }

    if (joinedCampaign !== campaignId) return;
    setRealtimeCampaign(result.ok ? campaignId : null);
    // Refused for the open campaign: the rights changed, which the campaign check sorts out.
    if (!result.ok && result.reason === "notFound") {
      void queryClient.invalidateQueries({ queryKey: campaignKey(campaignId, "detail") });
    }
  }

  function followRoute(route: RouteLocationNormalizedLoaded): void {
    const next = campaignOf(route);
    if (next === joinedCampaign) return;

    if (joinedCampaign) {
      if (socket?.connected) socket.emit("campaign:leave", joinedCampaign);
      else leftWhileAway.add(joinedCampaign);
    }
    if (next) leftWhileAway.delete(next);
    joinedCampaign = next;
    setRealtimeCampaign(null);
    if (next) void join(next);
  }

  function onInvalidate(message: InvalidateMessage): void {
    window.setTimeout(() => {
      void dispatchInvalidate(message, handlers, queryClient);
      // The server took this socket out of the campaign's rooms; joining again gives the new
      // role's rooms, or none.
      const campaignId = message.campaignId;
      if (message.resource === "campaign" && campaignId !== null && campaignId === joinedCampaign) {
        void join(campaignId);
      }
    }, random() * RELOAD_JITTER_MS);
  }

  async function open(): Promise<void> {
    const { io } = await loadClient();
    if (stopped || socket) return;

    const created: RealtimeSocket = io(realtimeUrl(), {
      path: REALTIME_PATH,
      // WebSocket first; long polling where a proxy or network blocks WebSockets.
      transports: ["websocket", "polling"],
      tryAllTransports: true,
      // Called for every connection attempt, so each one carries a fresh token.
      auth: (callback) => {
        sessionToken().then(
          (token) => callback({ token: token ?? "" }),
          // Without a token the gateway refuses, and the refusal is retried with a pause.
          () => callback({ token: "" }),
        );
      },
    });
    socket = created;

    created.on("connect", () => {
      retryMs = RETRY_MIN_MS;
      setRealtimeConnected(true);
      // Missed messages came with the recovery; otherwise anything may have changed meanwhile.
      if (connectedBefore && !created.recovered) void queryClient.invalidateQueries();
      connectedBefore = true;
      leftWhileAway.forEach((campaignId) => created.emit("campaign:leave", campaignId));
      leftWhileAway.clear();
      if (joinedCampaign) void join(joinedCampaign);
    });
    created.on("disconnect", (reason) => {
      setRealtimeConnected(false);
      window.clearTimeout(refreshTimer);
      // The client reconnects by itself except when the server ended the connection (token ran
      // out, account locked) or the page closed it.
      if (reason === "io server disconnect") retryLater();
    });
    created.on("connect_error", (error) => {
      // A refused handshake is not retried by the client itself.
      if (!created.active) {
        logger.warn("Realtime connection refused", { reason: error.message });
        retryLater();
      }
    });
    created.on("session", scheduleRefresh);
    created.on("invalidate", onInvalidate);
  }

  function ensureOpen(): void {
    if (stopped || socket || opening) return;
    opening = open()
      .catch((error: unknown) => {
        // Socket.IO's chunk didn't load (offline, new deploy): the app works without live updates.
        logger.warn("Realtime client could not be loaded", { error: String(error) });
      })
      .finally(() => {
        opening = null;
      });
  }

  function close(): void {
    clearTimers();
    socket?.disconnect();
    socket?.removeAllListeners();
    socket = null;
    joinedCampaign = null;
    leftWhileAway.clear();
    connectedBefore = false;
    setRealtimeConnected(false);
  }

  const unhookRoute = router.afterEach((to) => {
    if (APP_AREAS.has(to.meta.area ?? "")) ensureOpen();
    followRoute(to);
  });

  // Another account (or none) must not keep the old connection and its rooms.
  const unhookSession = onClerkSessionChange((sessionId) => {
    close();
    if (sessionId && APP_AREAS.has(router.currentRoute.value.meta.area ?? "")) {
      ensureOpen();
      followRoute(router.currentRoute.value);
    }
  });

  return () => {
    stopped = true;
    unhookRoute();
    unhookSession();
    close();
  };
}
