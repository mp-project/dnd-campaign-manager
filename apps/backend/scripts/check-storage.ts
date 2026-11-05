import { getEnv } from "#core/env";
import { checkStorageConnection } from "#core/storage/connectionCheck";
import { createStoragePortFromEnv } from "#core/storage/index";
import { bootstrapS3Storage } from "#core/runtime/storageBootstrap";
import { S3CompatibleStorage } from "#core/storage/s3Storage";

/** Checks the storage of the current environment, using the same settings as the server. */
async function runCheck(): Promise<void> {
  const env = getEnv();
  const target =
    env.STORAGE_DRIVER === "s3"
      ? `s3 ${env.STORAGE_S3_ENDPOINT ?? "(AWS)"} bucket ${env.STORAGE_S3_BUCKET}`
      : `local ${env.STORAGE_LOCAL_ROOT}`;

  console.info(`Checking storage: ${target}`);

  await bootstrapS3Storage(env);

  const storage = createStoragePortFromEnv(env);

  try {
    await checkStorageConnection(storage);
    console.info("Storage is reachable: write, read and delete succeeded.");
  } finally {
    if (storage instanceof S3CompatibleStorage) {
      storage.close();
    }
  }
}

runCheck().catch((error: unknown) => {
  const details = error as { message?: string; details?: unknown };

  console.error("Storage check failed:", details.message ?? error, details.details ?? "");
  process.exitCode = 1;
});
