import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { StoragePort } from "#core/storage/port";

/**
 * Writes, reads and deletes a small object, so a working check also proves the bucket exists and
 * the credentials have the rights the application needs.
 *
 * @param storage Storage adapter to check.
 * @throws When any step fails or the object reads back differently.
 */
export async function checkStorageConnection(storage: StoragePort): Promise<void> {
  const key = `_system/connection-check/${randomUUID()}.txt`;
  const payload = `connection-check ${key}`;

  await storage.put({
    key,
    stream: Readable.from(Buffer.from(payload)),
    contentType: "text/plain",
  });

  try {
    const chunks: Buffer[] = [];

    for await (const chunk of await storage.getStream(key)) {
      chunks.push(Buffer.from(chunk as Uint8Array));
    }

    if (Buffer.concat(chunks).toString() !== payload) {
      throw new Error("The stored object reads back with different content.");
    }
  } finally {
    await storage.delete(key);
  }
}
