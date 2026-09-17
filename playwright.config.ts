import { defineConfig } from "@playwright/test";

const e2ePort = process.env.BACKEND_PORT ?? "3100";
const e2eBaseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const backendPublicBaseUrl =
  process.env.BACKEND_PUBLIC_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";
const jwtAccessSecret =
  process.env.JWT_ACCESS_SECRET ?? "test-access-secret-1234";
const jwtRefreshSecret =
  process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-1234";
const jwtAccessTtl = process.env.JWT_ACCESS_TTL ?? "15m";
const jwtRefreshTtl = process.env.JWT_REFRESH_TTL ?? "7d";
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const apiBaseUrl =
  process.env.COMPOSE_BACKEND_PUBLIC_API_URL ??
  `http://localhost:${e2ePort}/api/v1`;
const storageMaxUploadBytes = process.env.STORAGE_MAX_UPLOAD_BYTES ?? "5242880";
const storageMaxTotalBytes = process.env.STORAGE_MAX_TOTAL_BYTES ?? "104857600";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  webServer: {
    command:
      `NODE_ENV=production HOST=127.0.0.1 PORT=${e2ePort} BACKEND_PUBLIC_BASE_URL=${backendPublicBaseUrl} DATABASE_URL=${testDatabaseUrl} TEST_DATABASE_URL=${testDatabaseUrl} JWT_ACCESS_SECRET=${jwtAccessSecret} JWT_REFRESH_SECRET=${jwtRefreshSecret} JWT_ACCESS_TTL=${jwtAccessTtl} JWT_REFRESH_TTL=${jwtRefreshTtl} LOG_LEVEL=warn CORS_ORIGIN=${corsOrigin} VITE_API_BASE_URL=${apiBaseUrl} STORAGE_MAX_UPLOAD_BYTES=${storageMaxUploadBytes} STORAGE_MAX_TOTAL_BYTES=${storageMaxTotalBytes} npm run start`,
    url: `${e2eBaseUrl}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
