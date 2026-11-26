import * as contracts from "@dnd/contracts/realtime";

import * as backend from "#core/realtime/messages";

/**
 * The backend mirrors the realtime messages of `@dnd/contracts` (its build can't import the
 * package). The type checks below fail `npm run typecheck` when one side changes alone.
 */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

function assertSame<T extends true>(value: T): T {
  return value;
}

describe("realtime messages", () => {
  it("match the contracts package", () => {
    assertSame<Same<backend.RealtimeResource, contracts.RealtimeResource>>(true);
    assertSame<Same<backend.InvalidateMessage, contracts.InvalidateMessage>>(true);
    assertSame<Same<backend.RealtimeSession, contracts.RealtimeSession>>(true);
    assertSame<Same<backend.CampaignJoinResult, contracts.CampaignJoinResult>>(true);
    assertSame<Same<backend.AuthRefreshResult, contracts.AuthRefreshResult>>(true);
    assertSame<Same<backend.RealtimeHandshakeAuth, contracts.RealtimeHandshakeAuth>>(true);
    assertSame<Same<backend.RealtimeServerToClientEvents, contracts.RealtimeServerToClientEvents>>(true);
    assertSame<Same<backend.RealtimeClientToServerEvents, contracts.RealtimeClientToServerEvents>>(true);

    expect(backend.REALTIME_PATH).toBe(contracts.REALTIME_PATH);
  });
});
