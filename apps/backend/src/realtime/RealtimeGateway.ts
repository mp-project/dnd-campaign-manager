import type { Server, Socket } from "socket.io";

import type { AccountPort, IdentityPort, ResolvedActor } from "#core/auth/identity";
import type { CampaignAccessFacts } from "#core/app/container";
import type { AppLogger } from "#core/log/logger";
import { reportError } from "#core/log/reportError";
import { isSysAdminRole } from "#core/permissions/roles";
import type {
  CampaignJoinResult,
  RealtimeClientToServerEvents,
  RealtimeServerToClientEvents,
  RealtimeSession,
} from "#core/realtime/messages";
import {
  campaignEditorsRoom,
  campaignIdOfRoom,
  campaignMembersRoom,
  campaignRooms,
  userRoom,
} from "#core/realtime/rooms";

/** What the gateway knows about a socket's account; checked again on every `auth:refresh`. */
export type RealtimeSocketData = {
  actorId: string;
  systemRole: ResolvedActor["systemRole"];
  sessionId: string;
  expiresAt: Date | null;
};

export type RealtimeServer = Server<
  RealtimeClientToServerEvents,
  RealtimeServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;

type RealtimeSocket = Socket<
  RealtimeClientToServerEvents,
  RealtimeServerToClientEvents,
  Record<string, never>,
  RealtimeSocketData
>;

export type RealtimeGatewayDependencies = {
  /** Without identity and account ports nobody is signed in, so every connection is refused. */
  identityPort: IdentityPort | undefined;
  accountPort: AccountPort | undefined;
  resolveCampaignAccess(input: { campaignId: string; actorId: string }): Promise<CampaignAccessFacts | null>;
  logger: AppLogger;
  /** Tests shorten it; see `SESSION_GRACE_MS`. */
  sessionGraceMs?: number;
  /**
   * Whether messages can reach this gateway (its Redis is connected). Without that, connections are
   * refused (`UNAVAILABLE`): a connected client would stop its own checks while hearing nothing.
   */
  isAvailable?: () => boolean;
};

/**
 * An expired token ends the connection a little later, so a client that refreshes just in time
 * isn't cut off by a slow round trip.
 */
export const SESSION_GRACE_MS = 30_000;

/** Campaigns one socket may be in at once: the open page's, and a few tabs' when they share it. */
export const MAX_CAMPAIGNS_PER_SOCKET = 10;

/** Each join costs a database query; a page change joins once, so this is far above normal use. */
export const MAX_JOINS_PER_MINUTE = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Refused handshakes say why in `data.code`, so the client knows whether to sign in again. */
class HandshakeError extends Error {
  constructor(readonly data: { code: "UNAUTHENTICATED" | "UNAVAILABLE" }) {
    super(data.code === "UNAUTHENTICATED" ? "Not signed in" : "Try again later");
  }
}

function sessionOf(expiresAt: Date | null): RealtimeSession {
  return {
    expiresInSeconds:
      expiresAt === null ? null : Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  };
}

/**
 * The realtime gateway's rules, on a Socket.IO server the caller created (adapter, CORS, path):
 * - the handshake carries the session token (`auth.token`), checked like an API request; the
 *   socket joins its account's room;
 * - `campaign:join` checks the campaign role like the API (non-members: `notFound`) and puts the
 *   socket into the members' room, game master, editors and administrators also into the editors'
 *   room; joining again replaces the rooms, so a changed role takes effect;
 * - `auth:refresh` swaps in a fresh token before the old one ends; a socket whose token ran out,
 *   or whose account may no longer use the app, is disconnected;
 * - a recovered connection (short interruption) gets its rooms and the messages it missed back
 *   from Socket.IO before any check can run; its campaigns are checked again right after, so a
 *   membership that ended meanwhile can still deliver references (never content) for that moment.
 * Clients never send content; writing stays with the API.
 */
export function attachRealtimeGateway(io: RealtimeServer, deps: RealtimeGatewayDependencies): void {
  async function authenticate(token: unknown): Promise<RealtimeSocketData | null> {
    if (typeof token !== "string" || !token || !deps.identityPort || !deps.accountPort) {
      return null;
    }

    const identity = await deps.identityPort.verifyToken(token);

    if (!identity) {
      return null;
    }

    const actor = await deps.accountPort.resolveActor(identity);

    return actor
      ? { ...actor, sessionId: identity.sessionId, expiresAt: identity.expiresAt }
      : null;
  }

  io.use((socket, next) => {
    if (deps.isAvailable && !deps.isAvailable()) {
      next(new HandshakeError({ code: "UNAVAILABLE" }));
      return;
    }

    const auth = socket.handshake.auth as Partial<Record<string, unknown>>;

    authenticate(auth.token).then(
      (data) => {
        if (!data) {
          next(new HandshakeError({ code: "UNAUTHENTICATED" }));
          return;
        }

        socket.data = data;
        next();
      },
      (error: unknown) => {
        // Usually the database; the client tries again later.
        reportError(deps.logger, error, "Realtime handshake failed", { task: "realtime.handshake" });
        next(new HandshakeError({ code: "UNAVAILABLE" }));
      },
    );
  });

  io.on("connection", (socket: RealtimeSocket) => {
    void onConnection(socket).catch((error: unknown) => {
      reportError(deps.logger, error, "Realtime connection setup failed", { task: "realtime.connect" });
      socket.disconnect(true);
    });
  });

  async function onConnection(socket: RealtimeSocket): Promise<void> {
    let expiryTimer: NodeJS.Timeout | null = null;
    // Joins, leaves and checks of one socket run one after another: a join that checked the role
    // before a change can't put the socket back into a room after the check that followed it.
    let roomWork: Promise<unknown> = Promise.resolve();
    const inOrder = <T>(work: () => Promise<T>): Promise<T> => {
      const result = roomWork.then(work);
      roomWork = result.catch(() => undefined);
      return result;
    };
    const joinTimes: number[] = [];

    function scheduleExpiry(): void {
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      const { expiresAt } = socket.data;

      if (expiresAt) {
        const delay =
          Math.max(0, expiresAt.getTime() - Date.now()) + (deps.sessionGraceMs ?? SESSION_GRACE_MS);
        expiryTimer = setTimeout(() => socket.disconnect(true), delay);
      }
    }

    socket.on("disconnect", () => {
      if (expiryTimer) clearTimeout(expiryTimer);
    });

    socket.on("campaign:join", (campaignId, ack) => {
      if (typeof ack !== "function") return;

      const now = Date.now();
      while (joinTimes.length > 0 && joinTimes[0]! < now - 60_000) joinTimes.shift();
      if (joinTimes.length >= MAX_JOINS_PER_MINUTE) {
        ack({ ok: false, reason: "tooMany" });
        return;
      }
      joinTimes.push(now);

      inOrder(() => joinCampaign(socket, campaignId)).then(ack, (error: unknown) => {
        reportError(deps.logger, error, "Realtime campaign join failed", { task: "realtime.join" });
        // Like a refused one: the client stays on the minute check and asks again after reconnecting.
        ack({ ok: false, reason: "notFound" });
      });
    });

    socket.on("campaign:leave", (campaignId) => {
      if (typeof campaignId !== "string") return;

      void inOrder(async () => {
        for (const room of campaignRooms(campaignId)) await socket.leave(room);
      });
    });

    socket.on("auth:refresh", (token, ack) => {
      if (typeof ack !== "function") return;

      authenticate(token).then(
        (data) => {
          // Another account's token is no refresh of this connection.
          if (!data || data.actorId !== socket.data.actorId) {
            ack({ ok: false });
            socket.disconnect(true);
            return;
          }

          const roleChanged = data.systemRole !== socket.data.systemRole;
          socket.data = data;
          scheduleExpiry();
          ack({ ok: true, session: sessionOf(data.expiresAt) });
          // An administrator's rooms of campaigns they are no member of end with the role.
          if (roleChanged) void inOrder(() => recheckCampaignRooms(socket));
        },
        (error: unknown) => {
          reportError(deps.logger, error, "Realtime token refresh failed", { task: "realtime.refresh" });
          // The old token keeps its time; the client tries again.
          ack({ ok: false });
        },
      );
    });

    if (socket.recovered) {
      await inOrder(() => recheckCampaignRooms(socket));
    }

    await socket.join(userRoom(socket.data.actorId));
    scheduleExpiry();
    socket.emit("session", sessionOf(socket.data.expiresAt));
  }

  async function joinCampaign(socket: RealtimeSocket, campaignId: unknown): Promise<CampaignJoinResult> {
    if (typeof campaignId !== "string" || !UUID.test(campaignId)) {
      return { ok: false, reason: "invalid" };
    }

    const joined = new Set([...socket.rooms].map(campaignIdOfRoom).filter((id) => id !== null));

    if (!joined.has(campaignId) && joined.size >= MAX_CAMPAIGNS_PER_SOCKET) {
      return { ok: false, reason: "tooMany" };
    }

    const rooms = await allowedRooms(socket.data, campaignId);

    for (const room of campaignRooms(campaignId)) {
      if (!rooms.includes(room)) await socket.leave(room);
    }

    if (rooms.length === 0) {
      return { ok: false, reason: "notFound" };
    }

    await socket.join(rooms);

    return { ok: true };
  }

  /** The rooms of a campaign the account may be in now, by the same rule as the API. */
  async function allowedRooms(data: RealtimeSocketData, campaignId: string): Promise<string[]> {
    const facts = await deps.resolveCampaignAccess({ campaignId, actorId: data.actorId });

    if (!facts) {
      return [];
    }

    // Administrators see every campaign in the full view, member or not.
    if (isSysAdminRole(data.systemRole) || facts.campaignRole === "OWNER" || facts.campaignRole === "EDITOR") {
      return [campaignEditorsRoom(campaignId), campaignMembersRoom(campaignId)];
    }

    return facts.campaignRole === "PLAYER" ? [campaignMembersRoom(campaignId)] : [];
  }

  /** A recovered socket's rooms are from before the interruption; the role may have changed since. */
  async function recheckCampaignRooms(socket: RealtimeSocket): Promise<void> {
    const campaignIds = new Set([...socket.rooms].map(campaignIdOfRoom).filter((id) => id !== null));

    for (const campaignId of campaignIds) {
      const rooms = await allowedRooms(socket.data, campaignId);

      for (const room of campaignRooms(campaignId)) {
        if (!rooms.includes(room)) await socket.leave(room);
      }
    }
  }
}
