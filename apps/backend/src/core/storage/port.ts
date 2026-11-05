import type { Readable } from "node:stream";

export type StoragePutInput = {
  key: string;
  stream: Readable;
  contentType: string;
  contentLength?: number;
  metadata?: Record<string, string>;
};

export type StorageObjectMetadata = {
  key: string;
  contentType: string;
  contentLength: number | null;
  etag: string | null;
  lastModified: Date | null;
};

export type StorageDownloadOptions = {
  contentType?: string;
  contentDisposition?: string;
  cacheControl?: string;
};

export type StoragePartInput = {
  key: string;
  uploadId: string;
  partNumber: number;
  stream: Readable;
  contentLength: number;
};

export type StoragePart = {
  partNumber: number;
  sizeBytes: number;
  etag: string;
};

export type StorageDriver = "s3" | "local" | "memory";

export type StoragePort = {
  readonly driver: StorageDriver;
  /** Whether a browser can fetch `createDownloadUrl` itself; otherwise content goes through the API. */
  readonly supportsDirectDownload: boolean;
  /** Parts may arrive in any order and be sent again; the object only appears on completion. */
  createMultipartUpload(key: string, contentType: string): Promise<string>;
  uploadPart(input: StoragePartInput): Promise<StoragePart>;
  listParts(key: string, uploadId: string): Promise<StoragePart[]>;
  completeMultipartUpload(key: string, uploadId: string, parts: StoragePart[]): Promise<void>;
  /** Also succeeds when the upload no longer exists. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;
  put(input: StoragePutInput): Promise<StorageObjectMetadata>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** The URL stays valid for at least `ttlSeconds`. */
  createDownloadUrl(
    key: string,
    ttlSeconds: number,
    options?: StorageDownloadOptions,
  ): Promise<string>;
  move?(fromKey: string, toKey: string): Promise<void>;
  listKeys?(prefix?: string): Promise<string[]>;
  stat?(key: string): Promise<StorageObjectMetadata>;
};
