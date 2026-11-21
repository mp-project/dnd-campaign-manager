const defaults: Record<string, string> = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: process.env.PORT ?? "3000",
  BACKEND_PUBLIC_BASE_URL:
    process.env.BACKEND_PUBLIC_BASE_URL ?? "http://api.localhost:3000",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test",
  TEST_DATABASE_URL:
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test",
  // Tests that check log lines give their own destination.
  LOG_LEVEL: "silent",
  CORS_ORIGIN: "http://app.localhost:5173",
  FRONTEND_ORIGIN: "http://app.localhost:5173",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
