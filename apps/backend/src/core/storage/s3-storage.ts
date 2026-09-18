import {
  CreateBucketCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { Readable as NodeReadable } from "node:stream";

import { StorageError } from "#core/storage/errors";
import {
  type StorageObjectMetadata,
  type StoragePort,
  type StoragePutInput,
} from "#core/storage/port";

export type S3StorageOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type S3BootstrapOptions = S3StorageOptions & {
  allowedOrigins: readonly string[];
};

const bootstrapMarkerKey = "_system/bootstrap/rustfs-bootstrap-v1.done";

/**
 * Builds an AWS SDK S3 client from the shared storage configuration.
 *
 * @param options S3 endpoint and credential settings.
 * @returns Configured S3 client instance.
 */
function createS3Client(options: S3StorageOptions): S3Client {
  const clientConfig: {
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  } = {
    region: options.region,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  };

  if (options.endpoint) {
    clientConfig.endpoint = options.endpoint;
  }

  if (options.forcePathStyle !== undefined) {
    clientConfig.forcePathStyle = options.forcePathStyle;
  }

  return new S3Client(clientConfig);
}

/**
 * Detects whether an S3 error signals a missing bucket.
 *
 * @param error Unknown error value thrown by AWS SDK.
 * @returns True when the error indicates that the bucket does not exist.
 */
function isMissingBucketError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    maybeError.$metadata?.httpStatusCode === 404 ||
    maybeError.name === "NotFound" ||
    maybeError.name === "NoSuchBucket" ||
    maybeError.Code === "NotFound" ||
    maybeError.Code === "NoSuchBucket"
  );
}

/**
 * Detects whether an S3 error signals a missing object key.
 *
 * @param error Unknown error value thrown by AWS SDK.
 * @returns True when the error indicates that the object key does not exist.
 */
function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const maybeError = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    maybeError.$metadata?.httpStatusCode === 404 ||
    maybeError.name === "NotFound" ||
    maybeError.name === "NoSuchKey" ||
    maybeError.Code === "NotFound" ||
    maybeError.Code === "NoSuchKey"
  );
}

/**
 * Checks if the one-time bootstrap marker exists in the bucket.
 *
 * @param client S3 client used for marker lookup.
 * @param bucket Bucket name that should contain the marker.
 * @returns True when bootstrap has already completed at least once.
 */
async function hasBootstrapMarker(
  client: S3Client,
  bucket: string,
): Promise<boolean> {
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: bootstrapMarkerKey,
      }),
    );

    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }

    throw error;
  }
}

/**
 * Ensures bucket existence and applies download CORS exactly once by writing a marker object.
 *
 * @param options S3 connection data and allowed browser origins for signed downloads.
 * @returns Promise that resolves when bootstrap has completed or was already done.
 */
export async function ensureS3BucketAndCors(
  options: S3BootstrapOptions,
): Promise<void> {
  const client = createS3Client(options);

  try {
    let bucketExists = true;

    try {
      await client.send(
        new HeadBucketCommand({
          Bucket: options.bucket,
        }),
      );
    } catch (error) {
      if (!isMissingBucketError(error)) {
        throw error;
      }

      bucketExists = false;
    }

    if (bucketExists) {
      const alreadyBootstrapped = await hasBootstrapMarker(client, options.bucket);

      if (alreadyBootstrapped) {
        return;
      }
    }

    if (!bucketExists) {
      await client.send(
        new CreateBucketCommand({
          Bucket: options.bucket,
        }),
      );
    }

    const uniqueOrigins = [...new Set(options.allowedOrigins)].filter(
      (origin) => origin.length > 0,
    );

    if (uniqueOrigins.length > 0) {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: options.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ["*"],
                AllowedMethods: ["GET", "HEAD"],
                AllowedOrigins: uniqueOrigins,
                ExposeHeaders: [
                  "ETag",
                  "Content-Length",
                  "Content-Type",
                  "Accept-Ranges",
                  "Content-Range",
                ],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      );
    }

    await client.send(
      new PutObjectCommand({
        Bucket: options.bucket,
        Key: bootstrapMarkerKey,
        Body: JSON.stringify({
          initializedAt: new Date().toISOString(),
          allowedOrigins: uniqueOrigins,
        }),
        ContentType: "application/json",
      }),
    );
  } catch (error) {
    throw new StorageError(
      "S3_CONFIGURATION_ERROR",
      "Failed to bootstrap S3 bucket/CORS configuration",
      {
        statusCode: 500,
        details: {
          cause: error instanceof Error ? error.message : "unknown",
          bucket: options.bucket,
          endpoint: options.endpoint ?? null,
        },
      },
    );
  }
}

/**
 * Converts AWS SDK response bodies to Node.js readable streams.
 *
 * @param body Raw response body returned by AWS SDK.
 * @returns Node readable stream for downstream piping.
 */
async function asNodeReadableStream(body: unknown): Promise<Readable> {
  if (body instanceof NodeReadable) {
    return body;
  }

  const maybeTransformToByteArray = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
  };

  if (maybeTransformToByteArray?.transformToByteArray) {
    const bytes = await maybeTransformToByteArray.transformToByteArray();
    return NodeReadable.from(bytes);
  }

  throw new StorageError("UPLOAD_STREAM_FAILED", "Unsupported S3 body stream type");
}

/**
 * StoragePort implementation backed by any S3-compatible object storage.
 */
export class S3CompatibleStorage implements StoragePort {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = createS3Client(options);
  }

  async put(input: StoragePutInput): Promise<StorageObjectMetadata> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.stream,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
        Metadata: input.metadata,
      }),
    );

    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.contentLength ?? null,
      etag: null,
      lastModified: new Date(),
    };
  }

  async getStream(key: string): Promise<Readable> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new StorageError("NOT_FOUND", `Object not found: ${key}`, {
        statusCode: 404,
      });
    }

    return asNodeReadableStream(response.Body);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async createDownloadUrl(key: string, ttlSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      {
        expiresIn: ttlSeconds,
      },
    );
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${fromKey}`,
        Key: toKey,
      }),
    );
    await this.delete(fromKey);
  }

  async listKeys(prefix: string = ""): Promise<string[]> {
    const response = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
      }),
    );

    return (response.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => typeof key === "string");
  }

  async stat(key: string): Promise<StorageObjectMetadata> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );

    return {
      key,
      contentType: response.ContentType ?? "application/octet-stream",
      contentLength: response.ContentLength ?? null,
      etag: response.ETag ?? null,
      lastModified: response.LastModified ?? null,
    };
  }
}
