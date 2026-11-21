import { describe, expect, it, vi } from "vitest";

import { createAuthFetch, type SessionTokenSource } from "@/core/api/authFetch";

const URL_CAMPAIGNS = "http://api.test/api/v1/campaigns";

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake server: answers in turn, records every call with its authorization and body. */
function fakeServer(answers: Array<() => Response>) {
  const calls: Array<{ authorization: string | null; body: string }> = [];
  const fetch = vi.fn(async (request: Request) => {
    calls.push({ authorization: request.headers.get("authorization"), body: await request.text() });
    const next = answers.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

/** Clerk's tokens: the cached one, a fresh one when asked to skip the cache. */
function tokens(cached: string | null, fresh: string | null = cached): SessionTokenSource {
  return vi.fn(async (options?: { fresh?: boolean }) => (options?.fresh ? fresh : cached));
}

function post(): Request {
  return new Request(URL_CAMPAIGNS, { method: "POST", body: JSON.stringify({ name: "Elaria" }) });
}

describe("createAuthFetch", () => {
  it("sends the session token as bearer", async () => {
    const server = fakeServer([() => json(200)]);
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens("t1") });

    expect((await authFetch(post())).status).toBe(200);
    expect(server.calls[0]?.authorization).toBe("Bearer t1");
  });

  it("sends no authorization without a session (public pages)", async () => {
    const server = fakeServer([() => json(401)]);
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens(null), onSessionExpired });

    expect((await authFetch(post())).status).toBe(401);
    expect(server.calls).toEqual([{ authorization: null, body: '{"name":"Elaria"}' }]);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("repeats a 401 once with a fresh token and the same body", async () => {
    const server = fakeServer([() => json(401), () => json(201, { id: "c1" })]);
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens("old", "new"), onSessionExpired });

    const response = await authFetch(post());

    expect(response.status).toBe(201);
    expect(server.calls).toEqual([
      { authorization: "Bearer old", body: '{"name":"Elaria"}' },
      { authorization: "Bearer new", body: '{"name":"Elaria"}' },
    ]);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("ends the session when the fresh token is refused too", async () => {
    const server = fakeServer([() => json(401), () => json(401)]);
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens("old", "new"), onSessionExpired });

    expect((await authFetch(post())).status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("ends the session when Clerk has no session any more", async () => {
    const server = fakeServer([() => json(401)]);
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens("old", null), onSessionExpired });

    expect((await authFetch(post())).status).toBe(401);
    expect(server.calls).toHaveLength(1);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("passes other answers on untouched", async () => {
    const server = fakeServer([() => json(403)]);
    const authFetch = createAuthFetch({ fetch: server.fetch, sessionToken: tokens("t1") });

    expect((await authFetch(post())).status).toBe(403);
    expect(server.calls).toHaveLength(1);
  });
});
