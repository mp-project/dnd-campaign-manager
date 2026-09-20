import { buildApp } from "#src/app";
import { createPgPool } from "#core/db/pool";
import { createTestEnv } from "#test/helpers/testEnv";

describe("HTTP smoke tests", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

  const pool = createPgPool(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  );
  const app = buildApp({
    env: createTestEnv({
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    }),
    pool,
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("responds 200 for /health", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("responds 200 for /ready when db and migrations are available", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("returns 404 for frontend routes because static serving is disabled", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/campaign-editor/overview",
      headers: {
        accept: "text/html",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("returns API 404 in unified error format", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/missing-endpoint",
      headers: {
        accept: "application/json",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  it("keeps API and health behavior for html accept headers", async () => {
    const apiResponse = await app.inject({
      method: "GET",
      url: "/api/v1/unknown-route",
      headers: {
        accept: "text/html",
      },
    });

    expect(apiResponse.statusCode).toBe(404);
    expect(apiResponse.headers["content-type"]).toContain("application/json");

    const healthResponse = await app.inject({
      method: "GET",
      url: "/health",
      headers: {
        accept: "text/html",
      },
    });

    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ status: "ok" });
  });
});
