import type { Pool } from "pg";

import { buildApp } from "#src/app";
import { createTestEnv } from "#test/helpers/test-env";

describe("buildApp", () => {
  it("returns /health from app factory", async () => {
    const app = buildApp({
      env: createTestEnv(),
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });

  it("returns 503 on /ready if migrations are missing", async () => {
    const app = buildApp({
      env: createTestEnv(),
      readyProbe: async () => ({ database: true, migrations: false }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: "INTERNAL_ERROR",
      },
    });

    await app.close();
  });

  it("returns 200 for API base path", async () => {
    const app = buildApp({
      env: createTestEnv(),
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      basePath: "/api/v1",
    });

    await app.close();
  });

  it("exposes OpenAPI UI under /documentation", async () => {
    const app = buildApp({
      env: createTestEnv(),
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const response = await app.inject({
      method: "GET",
      url: "/documentation",
    });

    expect([200, 301, 302]).toContain(response.statusCode);

    await app.close();
  });

  it("can create multiple isolated app instances", async () => {
    const appA = buildApp({
      env: createTestEnv(),
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const appB = buildApp({
      env: createTestEnv({ PORT: 3001 }),
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    const [responseA, responseB] = await Promise.all([
      appA.inject({ method: "GET", url: "/api/v1/ping" }),
      appB.inject({ method: "GET", url: "/api/v1/ping" }),
    ]);

    expect(responseA.statusCode).toBe(200);
    expect(responseA.json()).toEqual({ status: "pong" });
    expect(responseB.statusCode).toBe(200);
    expect(responseB.json()).toEqual({ status: "pong" });

    await Promise.all([appA.close(), appB.close()]);
  });

  it("releases pool resources when app closes", async () => {
    const fakePool = {
      end: jest.fn(async () => undefined),
      query: jest.fn(),
    };

    const app = buildApp({
      env: createTestEnv(),
      pool: fakePool as unknown as Pool,
      closePoolOnShutdown: true,
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
    });

    await app.close();

    expect(fakePool.end).toHaveBeenCalledTimes(1);
  });
});
