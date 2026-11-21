import { describe, expect, it, vi } from "vitest";

import { apiOrigin, createApiClient, unwrap } from "@/core/api/client";
import { ApiError, isVersionConflict, versionConflictDetails } from "@/core/api/errors";

function errorResponse(status: number, code: string, details: unknown = null, headers: HeadersInit = {}) {
  return new Response(
    JSON.stringify({ error: { code, message: "refused", details, requestId: "req-1" } }),
    { status, headers: { "content-type": "application/json", ...headers } },
  );
}

function clientAnswering(response: () => Response) {
  const fetch = vi.fn(async (request: Request) => {
    void request;
    return response();
  });
  return {
    fetch,
    api: createApiClient({
      apiBaseUrl: "http://api.test/api/v1",
      sessionToken: async () => null,
      fetch: fetch as unknown as typeof globalThis.fetch,
    }),
  };
}

describe("api client", () => {
  it("strips the version prefix, because the generated paths contain it", () => {
    expect(apiOrigin("http://api.localhost:3000/api/v1")).toBe("http://api.localhost:3000");
    expect(apiOrigin("/api/v1/")).toBe("");
  });

  it("returns the data of a successful call", async () => {
    const { api, fetch } = clientAnswering(
      () => new Response(JSON.stringify({ status: "ok" }), { headers: { "content-type": "application/json" } }),
    );

    await expect(unwrap(api.GET("/api/v1/ping"))).resolves.toEqual({ status: "ok" });
    expect(new URL(fetch.mock.calls[0]![0].url).pathname).toBe("/api/v1/ping");
  });

  it("throws the error envelope as ApiError with code, details and Retry-After", async () => {
    const { api } = clientAnswering(() => errorResponse(429, "RATE_LIMITED", null, { "retry-after": "30" }));

    const error = await unwrap(api.GET("/api/v1/ping")).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", requestId: "req-1", retryAfterSeconds: 30 });
  });

  it("describes a 412 with the current version and the conflicting fields", async () => {
    const { api } = clientAnswering(() =>
      errorResponse(412, "VERSION_CONFLICT", {
        currentVersion: 7,
        conflicts: [{ field: "name", changedBy: "user-2", yours: "Kupferkrug", current: "Zum Kupferkrug" }],
      }),
    );

    const error = await unwrap(api.GET("/api/v1/ping")).catch((caught: unknown) => caught);

    expect(isVersionConflict(error)).toBe(true);
    expect(versionConflictDetails(error as ApiError)).toEqual({
      currentVersion: 7,
      conflicts: [{ field: "name", changedBy: "user-2", yours: "Kupferkrug", current: "Zum Kupferkrug" }],
    });
  });

  it("turns a missing answer into NETWORK_ERROR and an unknown body into UNKNOWN_ERROR", async () => {
    const offline = clientAnswering(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(unwrap(offline.api.GET("/api/v1/ping"))).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });

    const proxy = clientAnswering(() => new Response("Bad Gateway", { status: 502 }));
    await expect(unwrap(proxy.api.GET("/api/v1/ping"))).rejects.toMatchObject({ code: "UNKNOWN_ERROR", status: 502 });
  });
});
