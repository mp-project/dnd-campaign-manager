/**
 * The messages of the realtime channel, mirrored from `packages/contracts/src/realtime.ts`: the
 * backend build can't import that package (TypeScript source outside `rootDir`), so the types are
 * repeated here and `tests/unit/realtime.contracts.test.ts` fails when the two drift apart.
 */

export const REALTIME_PATH = "/realtime/socket.io";

export type RealtimeResource = "account" | "campaign" | "campaign-memberships" | "content-shares";

export type InvalidateMessage = {
  resource: RealtimeResource;
  campaignId: string | null;
  ids?: string[];
};

export type RealtimeSession = {
  expiresInSeconds: number | null;
};

export type CampaignJoinResult =
  | { ok: true }
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

export type RealtimeHandshakeAuth = { token: string };
