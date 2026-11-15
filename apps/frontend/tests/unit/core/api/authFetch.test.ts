import { describe, expect, it, vi } from "vitest";

import { createAuthFetch } from "@/core/api/authFetch";

const BASE = "http://api.test/api/v1";

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** A fake server: answers by path, records every call with its body. */
function fakeServer(answers: Record<string, Array<() => Response>>) {
  const calls: Array<{ path: string; body: string }> = [];
  const fetch = vi.fn(async (request: Request) => {
    const path = new URL(request.url).pathname;
    calls.push({ path, body: await request.text() });
    const next = answers[path]?.shift();
    if (!next) throw new Error(`unexpected request ${path}`);
    return next();
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

describe("createAuthFetch", () => {
  it("renews the session on 401 and repeats the request with its body", async () => {
    const server = fakeServer({
      "/api/v1/campaigns": [() => json(401), () => json(201, { id: "c1" })],
      "/api/v1/auth/refresh": [() => json(200)],
    });
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch, onSessionExpired });

    const response = await authFetch(
      new Request(`${BASE}/campaigns`, { method: "POST", body: JSON.stringify({ name: "Elaria" }) }),
    );

    expect(response.status).toBe(201);
    expect(server.calls.map((call) => call.path)).toEqual([
      "/api/v1/campaigns",
      "/api/v1/auth/refresh",
      "/api/v1/campaigns",
    ]);
    expect(server.calls[2]?.body).toBe(JSON.stringify({ name: "Elaria" }));
    // The refresh route validates a JSON object; without one it answers 400 and never renews.
    expect(server.calls[1]?.body).toBe("{}");
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("shares one refresh between parallel 401s", async () => {
    const server = fakeServer({
      "/api/v1/a": [() => json(401), () => json(200)],
      "/api/v1/b": [() => json(401), () => json(200)],
      "/api/v1/auth/refresh": [() => json(200)],
    });
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch });

    const [a, b] = await Promise.all([
      authFetch(new Request(`${BASE}/a`)),
      authFetch(new Request(`${BASE}/b`)),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(server.calls.filter((call) => call.path === "/api/v1/auth/refresh")).toHaveLength(1);
  });

  it("reports an expired session when the refresh fails and passes the 401 on", async () => {
    const server = fakeServer({
      "/api/v1/me": [() => json(401)],
      "/api/v1/auth/refresh": [() => json(401)],
    });
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch, onSessionExpired });

    const response = await authFetch(new Request(`${BASE}/me`));

    expect(response.status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("leaves 401s of auth routes alone (wrong password is no expired session)", async () => {
    const server = fakeServer({ "/api/v1/auth/login": [() => json(401)] });
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch, onSessionExpired });

    const response = await authFetch(new Request(`${BASE}/auth/login`, { method: "POST" }));

    expect(response.status).toBe(401);
    expect(server.calls).toHaveLength(1);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it.each(["logout", "logout-all"])("renews the session for signing out (%s), which needs it like any other request", async (route) => {
    const server = fakeServer({
      [`/api/v1/auth/${route}`]: [() => json(401), () => new Response(null, { status: 204 })],
      "/api/v1/auth/refresh": [() => json(200)],
    });
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch });

    const response = await authFetch(new Request(`${BASE}/auth/${route}`, { method: "POST" }));

    expect(response.status).toBe(204);
    expect(server.calls.map((call) => call.path)).toEqual([
      `/api/v1/auth/${route}`,
      "/api/v1/auth/refresh",
      `/api/v1/auth/${route}`,
    ]);
  });

  it("takes a refresh another tab just made (409) as renewed and repeats the request", async () => {
    const server = fakeServer({
      "/api/v1/me": [() => json(401), () => json(200, { id: "u1" })],
      "/api/v1/auth/refresh": [() => json(409, { error: { code: "SESSION_ALREADY_ROTATED", message: "x" } })],
    });
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch, onSessionExpired });

    expect((await authFetch(new Request(`${BASE}/me`))).status).toBe(200);
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("still ends the session when the repeated request answers 401 after such a refresh", async () => {
    const server = fakeServer({
      "/api/v1/me": [() => json(401), () => json(401)],
      "/api/v1/auth/refresh": [() => json(409)],
    });
    const onSessionExpired = vi.fn();
    const authFetch = createAuthFetch({ baseUrl: BASE, fetch: server.fetch, onSessionExpired });

    expect((await authFetch(new Request(`${BASE}/me`))).status).toBe(401);
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });
});
