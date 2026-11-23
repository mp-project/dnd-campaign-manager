import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppEnv } from "#core/env";
import { LocalStorage } from "#core/storage/localStorage";
import {
  defaultAllowedMimeTypes,
  parseMimeAllowlist,
} from "#core/storage/mime";
import type { StoragePort } from "#core/storage/port";
import { S3CompatibleStorage } from "#core/storage/s3Storage";
import { UnavailableStorage } from "#core/storage/unavailableStorage";

const backendRootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Names the S3 settings that are missing; empty when S3 can be used.
 *
 * @param env Validated backend environment values.
 * @returns Names of the missing settings (no values).
 */
export function missingS3Settings(env: AppEnv): string[] {
  const settings = {
    STORAGE_S3_BUCKET: env.STORAGE_S3_BUCKET,
    STORAGE_S3_ACCESS_KEY_ID: env.STORAGE_S3_ACCESS_KEY_ID,
    STORAGE_S3_SECRET_ACCESS_KEY: env.STORAGE_S3_SECRET_ACCESS_KEY,
  };

  return Object.entries(settings)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

/**
 * Creates the storage adapter configured for the current environment.
 *
 * @param env Validated backend environment values.
 * @returns StoragePort implementation backed by S3-compatible or local storage.
 */
export function createStoragePortFromEnv(env: AppEnv): StoragePort {
  if (env.STORAGE_DRIVER === "s3") {
    const missing = missingS3Settings(env);

    // Files are one part of the app; without S3 the rest keeps working and uploads answer 503.
    if (missing.length > 0) {
      return new UnavailableStorage(missing);
    }

    const options: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
      publicEndpoint?: string;
      forcePathStyle?: boolean;
    } = {
      bucket: env.STORAGE_S3_BUCKET!,
      region: env.STORAGE_S3_REGION,
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID!,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY!,
    };

    if (env.STORAGE_S3_ENDPOINT) {
      options.endpoint = env.STORAGE_S3_ENDPOINT;
    }

    if (env.STORAGE_S3_PUBLIC_ENDPOINT) {
      options.publicEndpoint = env.STORAGE_S3_PUBLIC_ENDPOINT;
    }

    if (env.STORAGE_S3_FORCE_PATH_STYLE) {
      options.forcePathStyle = true;
    }

    return new S3CompatibleStorage(options);
  }

  const localRoot = path.isAbsolute(env.STORAGE_LOCAL_ROOT)
    ? env.STORAGE_LOCAL_ROOT
    : path.resolve(backendRootDirectory, env.STORAGE_LOCAL_ROOT);

  return new LocalStorage({
    rootDirectory: localRoot,
    downloadBaseUrl: env.BACKEND_PUBLIC_BASE_URL,
  });
}

/**
 * Parses the configured MIME allowlist into normalized MIME types.
 *
 * @param env Validated backend environment values.
 * @returns Set of accepted MIME types.
 */
export function createStorageMimeAllowlist(env: AppEnv): ReadonlySet<string> {
  return parseMimeAllowlist(env.STORAGE_ALLOWED_MIME_TYPES);
}

/**
 * Returns the built-in MIME allowlist used when env parsing is not involved.
 *
 * @returns Default MIME allowlist.
 */
export function createDefaultStorageMimeAllowlist(): ReadonlySet<string> {
  return new Set(defaultAllowedMimeTypes);
}
