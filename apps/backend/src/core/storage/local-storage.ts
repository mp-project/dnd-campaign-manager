import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

import { StorageError } from "#core/storage/errors";
import {
  type StorageObjectMetadata,
  type StoragePort,
  type StoragePutInput,
} from "#core/storage/port";

export type LocalStorageOptions = {
  rootDirectory: string;
  downloadBaseUrl: string;
};

/**
 * Normalizes user-facing storage keys into slash-separated canonical form.
 *
 * @param key Input key potentially containing backslashes or leading slashes.
 * @returns Normalized storage key.
 */
function normalizeStorageKey(key: string): string {
  return key.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Filesystem-backed StoragePort implementation for local development.
 */
export class LocalStorage implements StoragePort {
  private readonly rootDirectory: string;
  private readonly rootDirectoryWithSep: string;
  private readonly downloadBaseUrl: string;

  constructor(options: LocalStorageOptions) {
    this.rootDirectory = path.resolve(options.rootDirectory);
    this.rootDirectoryWithSep =
      this.rootDirectory.endsWith(path.sep)
        ? this.rootDirectory
        : `${this.rootDirectory}${path.sep}`;
    this.downloadBaseUrl = options.downloadBaseUrl.replace(/\/$/, "");
  }

  /**
   * Resolves a logical storage key to an absolute path inside the configured root.
   *
   * @param key Storage key provided by callers.
   * @returns Absolute filesystem path inside rootDirectory.
   */
  private resolveKeyPath(key: string): string {
    const normalizedKey = normalizeStorageKey(key);

    if (!normalizedKey || normalizedKey.includes("..")) {
      throw new StorageError("INVALID_KEY", "Storage key is invalid", {
        statusCode: 400,
        details: { key },
      });
    }

    const resolvedPath = path.resolve(this.rootDirectory, normalizedKey);

    if (
      resolvedPath !== this.rootDirectory &&
      !resolvedPath.startsWith(this.rootDirectoryWithSep)
    ) {
      throw new StorageError("INVALID_KEY", "Storage key escapes root", {
        statusCode: 400,
        details: { key },
      });
    }

    return resolvedPath;
  }

  private async readMetadata(key: string): Promise<StorageObjectMetadata> {
    const absolutePath = this.resolveKeyPath(key);

    try {
      const fileInfo = await stat(absolutePath);

      return {
        key,
        contentType: "application/octet-stream",
        contentLength: fileInfo.size,
        etag: null,
        lastModified: fileInfo.mtime,
      };
    } catch {
      throw new StorageError("NOT_FOUND", `Object not found: ${key}`, {
        statusCode: 404,
      });
    }
  }

  async put(input: StoragePutInput): Promise<StorageObjectMetadata> {
    const absolutePath = this.resolveKeyPath(input.key);

    await mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      await pipeline(input.stream, createWriteStream(absolutePath, { flags: "w" }));
      const fileInfo = await stat(absolutePath);

      return {
        key: input.key,
        contentType: input.contentType,
        contentLength: fileInfo.size,
        etag: null,
        lastModified: fileInfo.mtime,
      };
    } catch (error) {
      await rm(absolutePath, { force: true });

      if (error instanceof StorageError) {
        throw error;
      }

      throw new StorageError("UPLOAD_STREAM_FAILED", "Failed to store object", {
        statusCode: 500,
        details: { key: input.key },
      });
    }
  }

  async getStream(key: string): Promise<Readable> {
    const absolutePath = this.resolveKeyPath(key);

    try {
      await stat(absolutePath);
      return createReadStream(absolutePath);
    } catch {
      throw new StorageError("NOT_FOUND", `Object not found: ${key}`, {
        statusCode: 404,
      });
    }
  }

  async delete(key: string): Promise<void> {
    const absolutePath = this.resolveKeyPath(key);
    await rm(absolutePath, { force: true });
  }

  async exists(key: string): Promise<boolean> {
    const absolutePath = this.resolveKeyPath(key);

    try {
      await stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;

    return `${this.downloadBaseUrl}/api/v1/media/files/${encodeURIComponent(key)}?expiresAt=${expiresAt}`;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const sourcePath = this.resolveKeyPath(fromKey);
    const targetPath = this.resolveKeyPath(toKey);

    await mkdir(path.dirname(targetPath), { recursive: true });
    await rename(sourcePath, targetPath);
  }

  async listKeys(prefix: string = ""): Promise<string[]> {
    const keys: string[] = [];

    const walk = async (directory: string, relativePrefix: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const key = relativePrefix
          ? `${relativePrefix}/${entry.name}`
          : entry.name;

        if (entry.isDirectory()) {
          await walk(absolutePath, key);
          continue;
        }

        keys.push(key.replace(/\\/g, "/"));
      }
    };

    await mkdir(this.rootDirectory, { recursive: true });
    await walk(this.rootDirectory, "");

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }

  async stat(key: string): Promise<StorageObjectMetadata> {
    return this.readMetadata(key);
  }
}
