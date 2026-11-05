import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import { ListMultipartUploadsCommand, S3Client } from "@aws-sdk/client-s3";

import { checkStorageConnection } from "#core/storage/connectionCheck";
import type { S3BootstrapOptions } from "#core/storage/s3Storage";
import { ensureS3BucketAndCors, S3CompatibleStorage } from "#core/storage/s3Storage";
import {
  createTestS3Storage,
  deleteTestBucket,
  testS3Options,
} from "#test/helpers/s3TestStorage";
import { runStoragePortContract } from "#test/unit/storagePort.contract";

runStoragePortContract("S3CompatibleStorage (RustFS)", async () => {
  const options = testS3Options();

  await ensureS3BucketAndCors(options);

  const storage = createTestS3Storage(options);

  return {
    storage,
    cleanup: async () => {
      storage.close();
      await deleteTestBucket(options);
    },
  };
});

describe("S3CompatibleStorage (RustFS)", () => {
  let options: S3BootstrapOptions;
  let storage: S3CompatibleStorage;

  beforeEach(async () => {
    options = testS3Options();
    await ensureS3BucketAndCors(options);
    storage = createTestS3Storage(options);
  });

  afterEach(async () => {
    storage.close();
    await deleteTestBucket(options);
  });

  it("stores a stream of unknown length, like an upload", async () => {
    const payload = randomBytes(12 * 1024 * 1024);
    const key = `large/${randomUUID()}.bin`;

    await storage.put({
      key,
      // Multipart uploads arrive in chunks, and their size is unknown up front.
      stream: Readable.from(
        Array.from({ length: 12 }, (_, index) =>
          payload.subarray(index * 1024 * 1024, (index + 1) * 1024 * 1024),
        ),
      ),
      contentType: "application/octet-stream",
    });

    const received = createHash("sha256");

    for await (const chunk of await storage.getStream(key)) {
      received.update(chunk as Buffer);
    }

    expect(received.digest("hex")).toBe(createHash("sha256").update(payload).digest("hex"));
    await expect(storage.stat(key)).resolves.toMatchObject({
      contentLength: payload.length,
      contentType: "application/octet-stream",
    });
  }, 30_000);

  it("leaves nothing behind when the stream of a large upload breaks", async () => {
    const key = `large/${randomUUID()}.bin`;
    const stream = Readable.from(
      (async function* () {
        // More than one part, so the upload has really started on the server.
        yield randomBytes(20 * 1024 * 1024);
        throw new Error("client disconnected");
      })(),
    );

    await expect(
      storage.put({ key, stream, contentType: "application/octet-stream" }),
    ).rejects.toThrow("client disconnected");

    await expect(storage.exists(key)).resolves.toBe(false);

    const client = new S3Client({
      region: options.region,
      forcePathStyle: true,
      endpoint: options.endpoint as string,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
    const parts = await client.send(new ListMultipartUploadsCommand({ Bucket: options.bucket }));

    client.destroy();

    expect(parts.Uploads ?? []).toEqual([]);
  }, 30_000);

  it("lists more keys than one response holds", async () => {
    const keys = Array.from({ length: 1005 }, (_, index) => `many/${index}.txt`);

    for (let start = 0; start < keys.length; start += 100) {
      await Promise.all(
        keys.slice(start, start + 100).map((key) =>
          storage.put({ key, stream: Readable.from(Buffer.from("x")), contentType: "text/plain" }),
        ),
      );
    }

    await expect(storage.listKeys("many/")).resolves.toHaveLength(keys.length);

    await Promise.all(keys.map((key) => storage.delete(key)));
  }, 60_000);

  it("passes the connection check", async () => {
    await expect(checkStorageConnection(storage)).resolves.toBeUndefined();
    await expect(storage.listKeys("_system/connection-check/")).resolves.toEqual([]);
  });
});

describe("S3 connection", () => {
  it("fails the connection check on a missing bucket", async () => {
    const missing = createTestS3Storage(testS3Options());

    await expect(checkStorageConnection(missing)).rejects.toBeDefined();

    missing.close();
  });

  it("reports an unreachable storage instead of a missing file", async () => {
    const unreachable = createTestS3Storage({
      ...testS3Options(),
      endpoint: "http://127.0.0.1:1",
    });

    await expect(unreachable.exists("any-key")).rejects.toBeDefined();

    unreachable.close();
  });

  it("bootstraps a missing bucket and repeats without error", async () => {
    const options = testS3Options();

    await ensureS3BucketAndCors(options);
    await expect(ensureS3BucketAndCors(options)).resolves.toBeUndefined();

    await deleteTestBucket(options);
  });

  it("rejects wrong credentials", async () => {
    await expect(
      ensureS3BucketAndCors({ ...testS3Options(), secretAccessKey: "wrong-secret" }),
    ).rejects.toMatchObject({ code: "S3_CONFIGURATION_ERROR" });
  });

  it("fails on an unreachable endpoint", async () => {
    await expect(
      ensureS3BucketAndCors({ ...testS3Options(), endpoint: "http://127.0.0.1:1" }),
    ).rejects.toMatchObject({ code: "S3_CONFIGURATION_ERROR" });
  });
});
