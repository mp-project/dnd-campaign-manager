import { Readable } from "node:stream";

import {
  type StorageObjectMetadata,
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
  private readonly objects = new Map<string, InMemoryObject>();

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

  async listKeys(prefix: string = ""): Promise<string[]> {
    const keys = [...this.objects.keys()];

    if (!prefix) {
      return keys;
    }

    return keys.filter((key) => key.startsWith(prefix));
  }
}
