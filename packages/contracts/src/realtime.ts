/**
 * Messages of the realtime channel (Socket.IO) between the gateway and the browser. The server
 * sends references, never content: a client that gets `invalidate` loads again through the API,
 * which decides what it may see.
 *
 * The backend can't import this package in its build, so it mirrors these types in
 * `#core/realtime/messages`; a backend test fails when the two drift apart.
 */

/** Path of the Socket.IO endpoint, below the API's origin. */
export const REALTIME_PATH = "/realtime/socket.io";

/** What changed, named by the data the client holds, not by the server's tables. */
export type RealtimeResource =
  /** The own account (role, profile). */
  | "account"
  /** A campaign itself and the viewer's role in it; also sent when the viewer's membership changes. */
  | "campaign"
  /** The member list of a campaign (game master and editors). */
  | "campaign-memberships"
  /** The content shares of a campaign. */
  | "content-shares";

export type InvalidateMessage = {
  resource: RealtimeResource;
  campaignId: string | null;
  /** The changed ids when the sender knows them; absent means "anything of this resource". */
  ids?: string[];
};

/** Sent after connecting and after every `auth:refresh`: when the session token runs out. */
export type RealtimeSession = {
  /** Null when the token has no expiry (tests); else refresh before it ends. */
  expiresInSeconds: number | null;
};

export type CampaignJoinResult =
  | { ok: true }
  /** `notFound`: no campaign, or not one the account belongs to (like the API's 404). */
  | { ok: false; reason: "notFound" | "invalid" | "tooMany" };

export type AuthRefreshResult = { ok: true; session: RealtimeSession } | { ok: false };

export interface RealtimeServerToClientEvents {
  invalidate: (message: InvalidateMessage) => void;
  session: (session: RealtimeSession) => void;
}

export interface RealtimeClientToServerEvents {
  "campaign:join": (campaignId: string, ack: (result: CampaignJoinResult) => void) => void;
  "campaign:leave": (campaignId: string) => void;
  "auth:refresh": (token: string, ack: (result: AuthRefreshResult) => void) => void;
}

/** What the browser sends in the handshake (`auth` option of the client). */
export type RealtimeHandshakeAuth = { token: string };
