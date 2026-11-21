import { defineConfig } from "@playwright/test";

const e2ePort = process.env.BACKEND_PORT ?? "3100";
const e2eBaseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const backendPublicBaseUrl =
  process.env.BACKEND_PUBLIC_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";
// Production needs Clerk settings; the smoke tests sign nobody in, so placeholders do.
const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? "sk_test_e2e_placeholder";
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
const storageMaxUploadBytes = process.env.STORAGE_MAX_UPLOAD_BYTES ?? "5242880";
const storageMaxTotalBytes = process.env.STORAGE_MAX_TOTAL_BYTES ?? "104857600";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  webServer: {
    command:
      `NODE_ENV=production HOST=127.0.0.1 PORT=${e2ePort} BACKEND_PUBLIC_BASE_URL=${backendPublicBaseUrl} DATABASE_URL=${testDatabaseUrl} TEST_DATABASE_URL=${testDatabaseUrl} CLERK_SECRET_KEY=${clerkSecretKey} CLERK_AUTHORIZED_PARTIES=${corsOrigin} LOG_LEVEL=warn CORS_ORIGIN=${corsOrigin} STORAGE_MAX_UPLOAD_BYTES=${storageMaxUploadBytes} STORAGE_MAX_TOTAL_BYTES=${storageMaxTotalBytes} npm run start`,
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
