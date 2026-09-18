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

const envSchema = z.object({
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
  STORAGE_MAX_UPLOAD_BYTES: positiveInt,
  STORAGE_MAX_TOTAL_BYTES: positiveInt,
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = envSchema.parse(process.env);
  }

  return cachedEnv;
}
