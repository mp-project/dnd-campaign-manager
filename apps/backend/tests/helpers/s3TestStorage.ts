import { randomUUID } from "node:crypto";

import {
  DeleteBucketCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { S3CompatibleStorage, type S3BootstrapOptions } from "#core/storage/s3Storage";

/** Matches the `rustfs-test` service in compose.yaml. */
export function testS3Options(bucket = `dnd-test-${randomUUID()}`): S3BootstrapOptions {
  const endpoint = process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000";
  const { hostname } = new URL(endpoint);

  if (!["127.0.0.1", "localhost", "rustfs-test"].includes(hostname)) {
    throw new Error("Refusing to run storage tests against a non-local S3 endpoint.");
  }

  return {
    endpoint,
    bucket,
    region: "us-east-1",
    accessKeyId: process.env.TEST_S3_ACCESS_KEY_ID ?? "rustfs-test",
    secretAccessKey: process.env.TEST_S3_SECRET_ACCESS_KEY ?? "rustfs-test-secret",
    forcePathStyle: true,
    allowedOrigins: [],
  };
}

export function createTestS3Storage(options: S3BootstrapOptions): S3CompatibleStorage {
  return new S3CompatibleStorage(options);
}

/** Empties and removes the bucket of one test. */
export async function deleteTestBucket(options: S3BootstrapOptions): Promise<void> {
  const client = new S3Client({
    region: options.region,
    forcePathStyle: true,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
  });

  try {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: options.bucket }));

    await Promise.all(
      (listed.Contents ?? []).map((item) =>
        client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: item.Key })),
      ),
    );
    await client.send(new DeleteBucketCommand({ Bucket: options.bucket }));
  } finally {
    client.destroy();
  }
}
