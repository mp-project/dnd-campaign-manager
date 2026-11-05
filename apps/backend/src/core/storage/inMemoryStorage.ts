import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  type StorageDriver,
  type StorageObjectMetadata,
  type StoragePart,
  type StoragePartInput,
  type StoragePort,
  type StoragePutInput,
} from "#core/storage/port";

type InMemoryObject = {
  content: Buffer;
  contentType: string;
  createdAt: Date;
};

/**
 * Reads an entire stream into memory.
 *
 * @param stream Readable byte stream.
 * @returns Buffer containing all stream chunks.
 */
async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

/**
 * In-memory StoragePort implementation used mainly for tests.
 */
export class InMemoryStorage implements StoragePort {
  public readonly driver: StorageDriver = "memory";
  public readonly supportsDirectDownload = false;
  private readonly objects = new Map<string, InMemoryObject>();
  private readonly uploads = new Map<
    string,
    { contentType: string; parts: Map<number, Buffer> }
  >();

  async createMultipartUpload(_key: string, contentType: string): Promise<string> {
    const uploadId = randomUUID();

    this.uploads.set(uploadId, { contentType, parts: new Map() });

    return uploadId;
  }

  async uploadPart(input: StoragePartInput): Promise<StoragePart> {
    const content = await readAll(input.stream);

    this.requireUpload(input.uploadId).parts.set(input.partNumber, content);

    return {
      partNumber: input.partNumber,
      sizeBytes: content.length,
      etag: String(input.partNumber),
    };
  }

  async listParts(_key: string, uploadId: string): Promise<StoragePart[]> {
    return [...this.requireUpload(uploadId).parts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([partNumber, content]) => ({
        partNumber,
        sizeBytes: content.length,
        etag: String(partNumber),
      }));
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: StoragePart[],
  ): Promise<void> {
    const upload = this.requireUpload(uploadId);

    this.objects.set(key, {
      content: Buffer.concat(parts.map((part) => upload.parts.get(part.partNumber)!)),
      contentType: upload.contentType,
      createdAt: new Date(),
    });
    this.uploads.delete(uploadId);
  }

  async abortMultipartUpload(_key: string, uploadId: string): Promise<void> {
    this.uploads.delete(uploadId);
  }

  /** For tests: how many uploads were neither completed nor aborted. */
  countOpenUploads(): number {
    return this.uploads.size;
  }

  private requireUpload(uploadId: string) {
    const upload = this.uploads.get(uploadId);

    if (!upload) {
      throw new Error(`Upload not found: ${uploadId}`);
    }

    return upload;
  }

  async put(input: StoragePutInput): Promise<StorageObjectMetadata> {
    const content = await readAll(input.stream);
    const createdAt = new Date();

    this.objects.set(input.key, {
      content,
      contentType: input.contentType,
      createdAt,
    });

    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: content.length,
      etag: null,
      lastModified: createdAt,
    };
  }

  async getStream(key: string): Promise<Readable> {
    const object = this.objects.get(key);

    if (!object) {
      throw new Error(`Object not found: ${key}`);
    }

    return Readable.from(object.content);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return `memory://${encodeURIComponent(key)}?ttl=${ttlSeconds}`;
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const object = this.objects.get(fromKey);

    if (!object) {
      throw new Error(`Object not found: ${fromKey}`);
    }

    this.objects.set(toKey, object);
    this.objects.delete(fromKey);
  }

  async stat(key: string): Promise<StorageObjectMetadata> {
    const object = this.objects.get(key);

    if (!object) {
      throw new Error(`Object not found: ${key}`);
    }

    return {
      key,
      contentType: object.contentType,
      contentLength: object.content.length,
      etag: null,
      lastModified: object.createdAt,
    };
  }

  async listKeys(prefix: string = ""): Promise<string[]> {
    const keys = [...this.objects.keys()];

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }
}
