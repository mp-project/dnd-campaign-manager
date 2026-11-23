import { missingIntegrations } from "#core/runtime/integrations";
import { createStoragePortFromEnv, UnavailableStorage } from "#core/storage";
import { createTestEnv } from "#test/helpers/testEnv";

const COMPLETE = {
  NODE_ENV: "production",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
  CONTACT_EMAIL_TO: "info@example.test",
  REDIS_URL: "redis://redis:6379/0",
  STORAGE_DRIVER: "s3",
  STORAGE_S3_BUCKET: "bucket",
  STORAGE_S3_ACCESS_KEY_ID: "key",
  STORAGE_S3_SECRET_ACCESS_KEY: "secret",
} as const;

describe("missing integrations", () => {
  it("names nothing when everything is configured", () => {
    expect(missingIntegrations(createTestEnv(COMPLETE))).toEqual([]);
  });

  it("names each switched-off part with its missing settings, never values", () => {
    const env = createTestEnv({
      ...COMPLETE,
      CLERK_SECRET_KEY: undefined,
      CLERK_WEBHOOK_SIGNING_SECRET: undefined,
      CONTACT_EMAIL_TO: undefined,
      REDIS_URL: undefined,
      STORAGE_S3_BUCKET: undefined,
      STORAGE_S3_SECRET_ACCESS_KEY: undefined,
      MAIL_DRIVER: "smtp",
      MAIL_SMTP_USER: "no-reply@example.test",
    });

    expect(
      missingIntegrations(env).map(({ integration, missing }) => ({ integration, missing })),
    ).toEqual([
      { integration: "clerk", missing: ["CLERK_SECRET_KEY"] },
      { integration: "clerk-webhook", missing: ["CLERK_WEBHOOK_SIGNING_SECRET"] },
      {
        integration: "storage",
        missing: ["STORAGE_S3_BUCKET", "STORAGE_S3_SECRET_ACCESS_KEY"],
      },
      { integration: "mail", missing: ["MAIL_SMTP_PASS"] },
      { integration: "contact", missing: ["CONTACT_EMAIL_TO"] },
      { integration: "redis", missing: ["REDIS_URL"] },
    ]);
  });

  it("does not ask for Redis outside stage and production", () => {
    const env = createTestEnv({ ...COMPLETE, NODE_ENV: "development", REDIS_URL: undefined });

    expect(missingIntegrations(env)).toEqual([]);
  });
});

describe("storage without S3 settings", () => {
  it("starts with a storage that answers 503 instead of throwing at start", async () => {
    const storage = createStoragePortFromEnv(
      createTestEnv({ ...COMPLETE, STORAGE_S3_ACCESS_KEY_ID: undefined }),
    );

    expect(storage).toBeInstanceOf(UnavailableStorage);
    expect(storage.driver).toBe("unavailable");
    await expect(storage.createMultipartUpload("key", "image/png")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      statusCode: 503,
      details: { reason: "storageNotConfigured", missingSettings: ["STORAGE_S3_ACCESS_KEY_ID"] },
    });
  });
});
