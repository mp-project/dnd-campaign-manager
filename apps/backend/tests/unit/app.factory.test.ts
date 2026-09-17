import { buildApp } from "../../src/app.js";
import { createTestEnv } from "../helpers/test-env.js";

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
        code: "NOT_READY",
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
});
