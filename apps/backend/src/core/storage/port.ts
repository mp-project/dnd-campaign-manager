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

export type StoragePort = {
  put(input: StoragePutInput): Promise<StorageObjectMetadata>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  move?(fromKey: string, toKey: string): Promise<void>;
  listKeys?(prefix?: string): Promise<string[]>;
  stat?(key: string): Promise<StorageObjectMetadata>;
};
