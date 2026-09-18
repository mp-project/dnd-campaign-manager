import type { AppEnv } from "#core/env";

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

  return {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 3000,
    BACKEND_PUBLIC_BASE_URL:
      process.env.BACKEND_PUBLIC_BASE_URL ?? "http://api.localhost:3000",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
    JWT_ACCESS_SECRET: "test-access-secret-1234",
    JWT_REFRESH_SECRET: "test-refresh-secret-1234",
    JWT_ACCESS_TTL: "15m",
    JWT_REFRESH_TTL: "7d",
    LOG_LEVEL: "warn",
    CORS_ORIGIN: "http://app.localhost:5173",
    VITE_API_BASE_URL:
      process.env.COMPOSE_BACKEND_PUBLIC_API_URL ??
      "http://localhost:3100/api/v1",
    STORAGE_MAX_UPLOAD_BYTES: 5_242_880,
    STORAGE_MAX_TOTAL_BYTES: 104_857_600,
    ...overrides,
  };
}
