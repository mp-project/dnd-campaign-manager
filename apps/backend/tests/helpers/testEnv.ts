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
    MAIL_DRIVER: "noop",
    MAIL_FROM_ADDRESS: "no-reply@example.test",
    MAIL_FROM_NAME: "DnD Test",
    MAIL_SMTP_HOST: "127.0.0.1",
    MAIL_SMTP_PORT: 1025,
    MAIL_SMTP_SECURE: false,
    LOG_LEVEL: "silent",
    LOG_PRETTY: false,
    LOG_CHANGE_VALUES: true,
    LOG_EXPORT_LEVEL: "info",
    OTEL_SDK_DISABLED: false,
    SENTRY_LOG_LEVEL: "info",
    DEFAULT_RULESETS_ON_START: false,
    CORS_ORIGIN: "http://app.localhost:5173",
    FRONTEND_ORIGIN: "http://app.localhost:5173",
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_ROOT: "var/storage-test",
    STORAGE_ALLOWED_MIME_TYPES:
      "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm",
    STORAGE_DOWNLOAD_URL_TTL_SECONDS: 900,
    STORAGE_S3_REGION: "us-east-1",
    STORAGE_S3_FORCE_PATH_STYLE: false,
    STORAGE_S3_AUTO_BOOTSTRAP: false,
    ...overrides,
  };
}
