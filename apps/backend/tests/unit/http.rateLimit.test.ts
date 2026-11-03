import type { FastifyInstance } from "fastify";

import {
  RATE_LIMIT_MAX,
  SENSITIVE_ROUTE_RATE_LIMIT,
  normalizeClientIp,
} from "#core/http/rateLimit";
import type { AppModule } from "#core/app/moduleSystem";
import { buildTestApp } from "#test/helpers/buildTestApp";

const USER_A = { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" } as const;
const USER_B = { actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", systemRole: "USER" } as const;

const rateLimitTestModule: AppModule = {
  name: "rate-limit-test",
  dependencies: [],
  register: async (app: FastifyInstance) => {
    app.get("/first", async () => ({ ok: true }));
    app.get("/second", async () => ({ ok: true }));
    app.get("/items/:id", async () => ({ ok: true }));
    app.patch("/write", async () => ({ ok: true }));
    app.post("/sensitive", { config: { rateLimit: SENSITIVE_ROUTE_RATE_LIMIT } }, async () => ({
      ok: true,
    }));
  },
};

describe("route rate limit", () => {
  const { app, injectAs } = buildTestApp({ modules: [rateLimitTestModule] });
  const max = RATE_LIMIT_MAX.read;

  afterAll(async () => {
    await app.close();
  });

  async function exhaust(
    actor: { actorId: string; systemRole: "USER" },
    url: string,
    requests: number,
  ) {
    const statusCodes: number[] = [];

    for (let request = 0; request < requests; request += 1) {
      statusCodes.push((await injectAs(actor, { method: "GET", url })).statusCode);
    }

    return statusCodes;
  }

  it("limits a route per user and leaves other routes and users untouched", async () => {
    const statusCodes = await exhaust(USER_A, "/api/v1/first", max + 1);

    expect(statusCodes.filter((code) => code === 200)).toHaveLength(max);
    expect(statusCodes.filter((code) => code === 429)).toHaveLength(1);

    expect(await exhaust(USER_A, "/api/v1/second", 1)).toEqual([200]);
    expect(await exhaust(USER_B, "/api/v1/first", 1)).toEqual([200]);
  });

  it("returns the standard error payload and Retry-After when exceeded", async () => {
    await exhaust(USER_B, "/api/v1/second", max);

    const response = await injectAs(USER_B, { method: "GET", url: "/api/v1/second" });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });

  it("counts all ids of a route pattern together", async () => {
    await exhaust(USER_A, "/api/v1/items/1", max);

    expect(await exhaust(USER_A, "/api/v1/items/2", 1)).toEqual([429]);
  });

  it("falls back to the forwarded client IP for anonymous requests", async () => {
    const inject = (ip: string) =>
      app.inject({
        method: "GET",
        url: "/api/v1/first",
        headers: { "x-forwarded-for": ip },
        remoteAddress: "172.18.0.2",
      });

    for (let request = 0; request < max; request += 1) {
      await inject("203.0.113.1");
    }

    expect((await inject("203.0.113.1")).statusCode).toBe(429);
    expect((await inject("203.0.113.2")).statusCode).toBe(200);
  });

  it("allows fewer writes than reads per route", async () => {
    const statusCodes: number[] = [];

    for (let request = 0; request <= RATE_LIMIT_MAX.write; request += 1) {
      const response = await injectAs(USER_B, { method: "PATCH", url: "/api/v1/write" });
      statusCodes.push(response.statusCode);
    }

    expect(RATE_LIMIT_MAX.write).toBeLessThan(RATE_LIMIT_MAX.read);
    expect(statusCodes.filter((code) => code === 429)).toHaveLength(1);
  });

  it("gives anonymous requests the higher IP budget on sensitive routes", async () => {
    for (let request = 0; request < RATE_LIMIT_MAX.sensitiveIp; request += 1) {
      const response = await app.inject({ method: "POST", url: "/api/v1/sensitive" });

      expect(response.statusCode).toBe(200);
    }

    const response = await app.inject({ method: "POST", url: "/api/v1/sensitive" });

    expect(response.statusCode).toBe(429);
  });

  it("counts an IPv6 client as one /64 network", () => {
    expect(normalizeClientIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(normalizeClientIp("2001:DB8:1:2:bbbb::2")).toBe("2001:db8:1:2::/64");
    expect(normalizeClientIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(normalizeClientIp("203.0.113.5")).toBe("203.0.113.5");
  });

  it("applies the stricter limit from the route config", async () => {
    const statusCodes: number[] = [];

    for (let request = 0; request <= RATE_LIMIT_MAX.sensitiveUser; request += 1) {
      const response = await injectAs(USER_A, { method: "POST", url: "/api/v1/sensitive" });
      statusCodes.push(response.statusCode);
    }

    expect(statusCodes.filter((code) => code === 429)).toHaveLength(1);
    expect(statusCodes.at(-1)).toBe(429);
  });

  it("does not count CORS preflight requests", async () => {
    const responses = await Promise.all(
      Array.from({ length: max + 5 }, () =>
        app.inject({
          method: "OPTIONS",
          url: "/api/v1/first",
          headers: {
            origin: "http://app.localhost:5173",
            "access-control-request-method": "GET",
          },
        }),
      ),
    );

    expect(responses.every((response) => response.statusCode !== 429)).toBe(true);
  });
});
