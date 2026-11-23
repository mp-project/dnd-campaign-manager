import type { Readable } from "node:stream";

import { ServiceUnavailableError } from "#core/error/http/ServiceUnavailableError";
import type {
  StorageDriver,
  StorageObjectMetadata,
  StoragePart,
  StoragePort,
} from "#core/storage/port";

/**
 * Stands in for S3 while its settings are missing: the app starts and everything else works, every
 * file operation answers 503. The missing settings are named once at start, not per request.
 */
export class UnavailableStorage implements StoragePort {
  public readonly driver: StorageDriver = "unavailable";
  public readonly supportsDirectDownload = false;

  /** @param missingSettings Names of the settings that are missing (no values). */
  constructor(private readonly missingSettings: readonly string[]) {}

  private unavailable(): Promise<never> {
    return Promise.reject(
      new ServiceUnavailableError("File storage is not configured", {
        reason: "storageNotConfigured",
        missingSettings: this.missingSettings,
      }),
    );
  }

  createMultipartUpload(): Promise<string> {
    return this.unavailable();
  }

  uploadPart(): Promise<StoragePart> {
    return this.unavailable();
  }

  listParts(): Promise<StoragePart[]> {
    return this.unavailable();
  }

  completeMultipartUpload(): Promise<void> {
    return this.unavailable();
  }

  abortMultipartUpload(): Promise<void> {
    return this.unavailable();
  }

  put(): Promise<StorageObjectMetadata> {
    return this.unavailable();
  }

  getStream(): Promise<Readable> {
    return this.unavailable();
  }

  delete(): Promise<void> {
    return this.unavailable();
  }

  exists(): Promise<boolean> {
    return this.unavailable();
  }

  createDownloadUrl(): Promise<string> {
    return this.unavailable();
  }
}
