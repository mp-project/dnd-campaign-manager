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

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1),
    PORT: z.coerce.number().int().min(1).max(65_535),
    BACKEND_PUBLIC_BASE_URL: z.string().url(),
    DATABASE_URL: z.string().url(),
    TEST_DATABASE_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(16),
    JWT_REFRESH_SECRET: z.string().min(16),
    JWT_ACCESS_TTL: z.string().min(2),
    JWT_REFRESH_TTL: z.string().min(2),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
    CORS_ORIGIN: z.string().min(1),
    VITE_API_BASE_URL: z.string().url(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("s3"),
    STORAGE_LOCAL_ROOT: z.string().min(1).default("var/storage"),
    STORAGE_ALLOWED_MIME_TYPES: z
      .string()
      .min(1)
      .default(
        "image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,audio/mpeg,audio/wav,audio/ogg,video/mp4,video/webm",
      ),
    STORAGE_DOWNLOAD_URL_TTL_SECONDS: positiveInt.default(900),
    STORAGE_S3_ENDPOINT: z.string().url().optional(),
    STORAGE_S3_DASHBOARD_URL: z.string().url().optional(),
    STORAGE_S3_REGION: z.string().min(1).default("us-east-1"),
    STORAGE_S3_BUCKET: z.string().min(1).optional(),
    STORAGE_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    STORAGE_S3_FORCE_PATH_STYLE: booleanFromEnv.default(false),
    STORAGE_S3_AUTO_BOOTSTRAP: booleanFromEnv.default(false),
    STORAGE_S3_BOOTSTRAP_CORS_ORIGINS: z.string().optional(),
    STORAGE_MAX_UPLOAD_BYTES: positiveInt,
    STORAGE_MAX_TOTAL_BYTES: positiveInt,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.STORAGE_DRIVER !== "s3") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORAGE_DRIVER"],
        message: "STORAGE_DRIVER must be \"s3\" when NODE_ENV=production",
      });
    }

    if (env.STORAGE_DRIVER !== "s3") {
      return;
    }

    const requiredS3Keys = [
      "STORAGE_S3_BUCKET",
      "STORAGE_S3_ACCESS_KEY_ID",
      "STORAGE_S3_SECRET_ACCESS_KEY",
    ] as const;

    for (const key of requiredS3Keys) {
      if (!env[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `${key} is required when STORAGE_DRIVER=s3`,
        });
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}
