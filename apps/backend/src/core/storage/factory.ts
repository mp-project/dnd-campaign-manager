import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppEnv } from "#core/env";
import { StorageError } from "#core/storage/errors";
import { LocalStorage } from "#core/storage/local-storage";
import {
  defaultAllowedMimeTypes,
  parseMimeAllowlist,
} from "#core/storage/mime";
import type { StoragePort } from "#core/storage/port";
import { S3CompatibleStorage } from "#core/storage/s3-storage";

const backendRootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

/**
 * Ensures required S3 settings are present in environment configuration.
 *
 * @param value Candidate value.
 * @param key Environment key name for error reporting.
 * @returns Non-empty string value.
 */
function required(value: string | undefined, key: string): string {
  if (!value) {
    throw new StorageError(
      "S3_CONFIGURATION_ERROR",
      `Missing required storage setting ${key}`,
      {
        statusCode: 500,
      },
    );
  }

  return value;
}

/**
 * Creates the storage adapter configured for the current environment.
 *
 * @param env Validated backend environment values.
 * @returns StoragePort implementation backed by S3-compatible or local storage.
 */
export function createStoragePortFromEnv(env: AppEnv): StoragePort {
  if (env.STORAGE_DRIVER === "s3") {
    const options: {
      bucket: string;
      region: string;
      accessKeyId: string;
      secretAccessKey: string;
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      bucket: required(env.STORAGE_S3_BUCKET, "STORAGE_S3_BUCKET"),
      region: required(env.STORAGE_S3_REGION, "STORAGE_S3_REGION"),
      accessKeyId: required(env.STORAGE_S3_ACCESS_KEY_ID, "STORAGE_S3_ACCESS_KEY_ID"),
      secretAccessKey: required(
        env.STORAGE_S3_SECRET_ACCESS_KEY,
        "STORAGE_S3_SECRET_ACCESS_KEY",
      ),
    };

    if (env.STORAGE_S3_ENDPOINT) {
      options.endpoint = env.STORAGE_S3_ENDPOINT;
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
