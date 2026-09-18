import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../../src/app.js";
import { createPgPool } from "../../src/core/db/pool.js";
import { createTestEnv } from "../helpers/test-env.js";

describe("HTTP smoke tests", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

  const staticRoot = mkdtempSync(path.join(os.tmpdir(), "backend-static-"));
  const staticAssetsDir = path.join(staticRoot, "assets");

  mkdirSync(staticAssetsDir, { recursive: true });
  writeFileSync(
    path.join(staticRoot, "index.html"),
    '<!doctype html><html><head><title>Backend Static Smoke</title></head><body><div id="app"></div></body></html>',
  );
  writeFileSync(
    path.join(staticAssetsDir, "app.js"),
    "console.log('backend-static-smoke');\n",
  );

  const pool = createPgPool(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "",
  );
  const app = buildApp({
    env: createTestEnv({
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    }),
    pool,
    staticRoot,
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
    rmSync(staticRoot, { recursive: true, force: true });
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

  it("serves static assets and html fallback for client routes", async () => {
    const assetResponse = await app.inject({
      method: "GET",
      url: "/assets/app.js",
    });

    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.body).toContain("backend-static-smoke");

    const fallbackResponse = await app.inject({
      method: "GET",
      url: "/campaign-editor/overview",
      headers: {
        accept: "text/html",
      },
    });

    expect(fallbackResponse.statusCode).toBe(200);
    expect(fallbackResponse.body).toContain(
      "<title>Backend Static Smoke</title>",
    );
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

  it("does not swallow API and health routes in SPA fallback", async () => {
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
