import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const backendRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const workspaceRootDir = path.resolve(backendRootDir, "../..");

loadEnv({ path: path.join(backendRootDir, ".env"), quiet: true });
loadEnv({ path: path.join(backendRootDir, ".env.local"), quiet: true });
loadEnv({ path: path.join(workspaceRootDir, ".env"), quiet: true });

const positiveInt = z.coerce.number().int().positive();
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? undefined : normalized;
}, z.string().min(1).optional());

const optionalEmailString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? undefined : normalized;
}, z.string().email().optional());

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? undefined : normalized;
}, z.string().url().optional());

export function isProductionLikeNodeEnv(nodeEnv: string): boolean {
  return nodeEnv === "production" || nodeEnv === "stage";
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "stage", "production"])
      .default("development"),
    HOST: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65_535),
    BACKEND_PUBLIC_BASE_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    // Only the integration tests use it; servers and jobs run without it.
    TEST_DATABASE_URL: optionalUrlString,
    // Clerk (sign-in, registration, waitlist). Without the secret key no request is signed in.
    CLERK_SECRET_KEY: optionalNonEmptyString,
    // PEM public key of the instance; verifies session tokens without fetching the JWKS.
    CLERK_JWT_KEY: optionalNonEmptyString,
    // Frontend origins whose session tokens are accepted (comma separated; `azp` claim).
    CLERK_AUTHORIZED_PARTIES: optionalNonEmptyString,
    // Signing secret of the Clerk webhook (`whsec_…`); without it the webhook answers 503.
    CLERK_WEBHOOK_SIGNING_SECRET: optionalNonEmptyString,
    // The account that signs in with this verified address becomes the first system maintainer
    // when its local account is created or linked; replaces creating one by SQL.
    BOOTSTRAP_MAINTAINER_EMAIL: optionalEmailString,
    MAIL_DRIVER: z.enum(["smtp", "noop"]).default("smtp"),
    MAIL_FROM_ADDRESS: z.string().email().default("no-reply@api.localhost"),
    MAIL_FROM_NAME: z.string().min(1).max(120).default("Questaria"),
    // Where answers to the app's mails go (e.g. kontakt@<domain>); a message may set its own.
    MAIL_REPLY_TO: optionalEmailString,
    MAIL_SMTP_HOST: z.string().min(1).default("127.0.0.1"),
    MAIL_SMTP_PORT: positiveInt.default(1025),
    MAIL_SMTP_SECURE: booleanFromEnv.default(false),
    MAIL_SMTP_USER: optionalNonEmptyString,
    MAIL_SMTP_PASS: optionalNonEmptyString,
    MAILPIT_UI_URL: z.string().url().optional(),
    // Where the contact form's messages go; without it the form answers 503.
    CONTACT_EMAIL_TO: optionalEmailString,
    // Signs the contact form's JS challenge; without it a random key per process (one instance only).
    CONTACT_CHALLENGE_SECRET: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    // Create the default rulesets at start (once per version); off in tests, which start empty.
    DEFAULT_RULESETS_ON_START: booleanFromEnv.default(true),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    // New values in the `change` lines (account and secret fields never). On while the data is
    // still being checked; switch off to log only ids and field names.
    LOG_CHANGE_VALUES: booleanFromEnv.default(true),
    // Readable single lines (pino-pretty) instead of JSON; only for development.
    LOG_PRETTY: booleanFromEnv.default(false),
    // Lowest level sent to Grafana (OpenTelemetry logs); only with an OTLP endpoint. Separate from
    // LOG_LEVEL so stdout and the export can be turned down independently.
    LOG_EXPORT_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    // OTLP endpoint (Grafana Cloud); without it no telemetry is started. Headers, protocol and
    // sampling are read by the SDK itself from the standard OTEL_* variables.
    OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrlString,
    OTEL_SDK_DISABLED: booleanFromEnv.default(false),
    // Sentry (backend project); without a DSN nothing is reported. Errors always, log lines from
    // SENTRY_LOG_LEVEL. SENTRY_RELEASE ties events to a deploy (git SHA).
    SENTRY_DSN: optionalUrlString,
    SENTRY_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    SENTRY_RELEASE: optionalNonEmptyString,
    // Key for the hashed client IP in request logs; without it a random key per process.
    LOG_IP_HASH_SECRET: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z.string().min(16).optional(),
    ),
    // Rate limits shared by all API instances and caches (`redis://[:password@]host:port/db`).
    // Without it each process counts and caches on its own (named at start in stage and production).
    REDIS_URL: optionalUrlString,
    CORS_ORIGIN: z.string().min(1),
    FRONTEND_ORIGIN: z.string().url().default("http://app.localhost:5173"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("s3"),
    STORAGE_LOCAL_ROOT: z.string().min(1).default("var/storage"),
    STORAGE_ALLOWED_MIME_TYPES: z
      .string()
      .min(1)
      .default(
        "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm",
      ),
    STORAGE_DOWNLOAD_URL_TTL_SECONDS: positiveInt.default(300),
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_PUBLIC_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_DASHBOARD_URL: z.string().url().optional(),
    STORAGE_S3_REGION: z.string().min(1).default("us-east-1"),
    STORAGE_S3_BUCKET: z.string().min(1).optional(),
    STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_S3_FORCE_PATH_STYLE: booleanFromEnv.default(false),
    STORAGE_S3_AUTO_BOOTSTRAP: booleanFromEnv.default(false),
    STORAGE_S3_BOOTSTRAP_CORS_ORIGINS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Missing settings of a single integration (Clerk, S3, mail, Redis, telemetry) never stop the
    // app: that part is switched off and named at start (`missingIntegrations`). Only a value that
    // is set but wrong is refused here.
    if (isProductionLikeNodeEnv(env.NODE_ENV) && env.STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_DRIVER"],
        message: "STORAGE_DRIVER must be \"s3\" when NODE_ENV=production or stage",
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

/**
 * Returns validated environment configuration with lazy one-time parsing.
 *
 * @returns Parsed and cached application environment values.
 */
export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}
