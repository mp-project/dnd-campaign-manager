import type { AppEnv } from "#core/env";
import { ensureS3BucketAndCors } from "#core/storage/s3Storage";

/**
 * Resolves browser origins that may fetch signed S3 download URLs.
 *
 * @param env Validated runtime environment.
 * @returns Normalized list of allowed origins.
 */
function resolveStorageCorsOrigins(env: AppEnv): string[] {
  const source = env.STORAGE_S3_BOOTSTRAP_CORS_ORIGINS ?? env.CORS_ORIGIN;

  return source
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Runs optional S3 bootstrap before the HTTP server starts listening.
 *
 * @param env Validated runtime environment.
 */
export async function bootstrapS3Storage(env: AppEnv): Promise<void> {
  if (env.STORAGE_DRIVER !== "s3" || !env.STORAGE_S3_AUTO_BOOTSTRAP) {
    return;
  }

  const bootstrapOptions: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle?: boolean;
    allowedOrigins: string[];
  } = {
    bucket: env.STORAGE_S3_BUCKET!,
    region: env.STORAGE_S3_REGION,
    accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
    secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    allowedOrigins: resolveStorageCorsOrigins(env),
  };

  if (env.STORAGE_S3_ENDPOINT) {
    bootstrapOptions.endpoint = env.STORAGE_S3_ENDPOINT;
  }

  await ensureS3BucketAndCors(bootstrapOptions);
}
