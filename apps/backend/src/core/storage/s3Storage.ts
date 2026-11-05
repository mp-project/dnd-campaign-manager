import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { PassThrough, Readable as NodeReadable } from "node:stream";

import { StorageError } from "#core/storage/errors";
import {
  type StorageDownloadOptions,
  type StorageObjectMetadata,
  type StoragePart,
  type StoragePartInput,
  type StoragePort,
  type StoragePutInput,
} from "#core/storage/port";

export type S3StorageOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  /** Address browsers reach the storage at, if it differs from `endpoint`; signed URLs contain it. */
  publicEndpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export type S3BootstrapOptions = S3StorageOptions & {
  allowedOrigins: readonly string[];
};

const bootstrapMarkerKey = "_system/bootstrap/rustfs-bootstrap-v1.done";
const UPLOAD_PART_BYTES = 8 * 1024 * 1024;
const UPLOAD_CONCURRENT_PARTS = 2;
/** Parts of slow clients hold a connection each; the default of 50 runs out too easily. */
const MAX_SOCKETS = 200;

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
    requestHandler: { httpAgent: { maxSockets: number }; httpsAgent: { maxSockets: number } };
    responseChecksumValidation: "WHEN_REQUIRED";
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
  } = {
    region: options.region,
    requestHandler: {
      httpAgent: { maxSockets: MAX_SOCKETS },
      httpsAgent: { maxSockets: MAX_SOCKETS },
    },
    responseChecksumValidation: "WHEN_REQUIRED",
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

function isMissingUploadError(error: unknown): boolean {
  const maybeError = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;

  return maybeError?.name === "NoSuchUpload" || maybeError?.$metadata?.httpStatusCode === 404;
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
  } finally {
    client.destroy();
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
  public readonly driver = "s3";
  public readonly supportsDirectDownload = true;
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = createS3Client(options);
    this.signingClient = options.publicEndpoint
      ? createS3Client({ ...options, endpoint: options.publicEndpoint })
      : this.client;
  }

  async createMultipartUpload(key: string, contentType: string): Promise<string> {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );

    if (!UploadId) {
      throw new StorageError("UPLOAD_STREAM_FAILED", "The storage returned no upload id");
    }

    return UploadId;
  }

  /**
   * The stream goes straight through, so a part never sits in memory as a whole. The SDK doesn't
   * handle errors of its input: a client breaking off would end the process and leave the request to
   * the storage hanging. So the SDK gets a stream of its own, and a broken input only aborts it.
   */
  async uploadPart(input: StoragePartInput): Promise<StoragePart> {
    const abort = new AbortController();
    const body = new PassThrough();

    input.stream.once("error", () => {
      abort.abort();
      body.destroy();
    });
    input.stream.pipe(body);

    const { ETag } = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: input.partNumber,
        Body: body,
        ContentLength: input.contentLength,
      }),
      { abortSignal: abort.signal },
    );

    return { partNumber: input.partNumber, sizeBytes: input.contentLength, etag: ETag ?? "" };
  }

  async listParts(key: string, uploadId: string): Promise<StoragePart[]> {
    const parts: StoragePart[] = [];
    let marker: string | undefined;

    do {
      const response = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );

      for (const part of response.Parts ?? []) {
        parts.push({
          partNumber: part.PartNumber ?? 0,
          sizeBytes: part.Size ?? 0,
          etag: part.ETag ?? "",
        });
      }

      marker = response.IsTruncated ? response.NextPartNumberMarker : undefined;
    } while (marker);

    return parts;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: StoragePart[],
  ): Promise<void> {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
      );
    } catch (error) {
      if (!isMissingUploadError(error)) {
        throw error;
      }
    }
  }

  /**
   * The size of an upload is only known at its end, which a plain `PutObject` can't handle. The
   * managed upload sends parts instead, holding at most `partSize * queueSize` bytes in memory, and
   * removes the parts if the stream fails. Files below one part size become a single `PutObject`.
   */
  async put(input: StoragePutInput): Promise<StorageObjectMetadata> {
    const result = await new Upload({
      client: this.client,
      partSize: UPLOAD_PART_BYTES,
      queueSize: UPLOAD_CONCURRENT_PARTS,
      leavePartsOnError: false,
      params: {
        Bucket: this.bucket,
        Key: input.key,
        Body: input.stream,
        ContentType: input.contentType,
        Metadata: input.metadata,
      },
    }).done();

    return {
      key: input.key,
      contentType: input.contentType,
      contentLength: input.contentLength ?? null,
      etag: result.ETag ?? null,
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
    } catch (error) {
      // An unreachable storage must not look like a missing file.
      if (isMissingObjectError(error)) {
        return false;
      }

      throw error;
    }
  }

  /**
   * Signs with the start of the current time window, so the URL stays the same within it and the
   * browser can use its cache. Twice the time keeps it valid for at least `ttlSeconds`.
   */
  async createDownloadUrl(
    key: string,
    ttlSeconds: number,
    options: StorageDownloadOptions = {},
  ): Promise<string> {
    const windowMs = ttlSeconds * 1000;

    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: options.contentDisposition,
        ResponseCacheControl: options.cacheControl,
      }),
      {
        expiresIn: ttlSeconds * 2,
        signingDate: new Date(Math.floor(Date.now() / windowMs) * windowMs),
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
    const keys: string[] = [];
    let continuationToken: string | undefined;

    // One response holds at most 1000 keys.
    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents ?? []) {
        if (item.Key) {
          keys.push(item.Key);
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  /** Closes the connections; for short-lived processes such as scripts and tests. */
  close(): void {
    this.client.destroy();
    this.signingClient.destroy();
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
