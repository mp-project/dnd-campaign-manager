import { createHash } from "node:crypto";
import { Transform } from "node:stream";

import { StorageError } from "#core/storage/errors";
import {
  assertAllowedMimeType,
  assertMagicBytesMatchMimeType,
} from "#core/storage/mime";

const DEFAULT_MAGIC_BYTES_LIMIT = 64;

export type UploadInspectionResult = {
  contentType: string;
  contentLength: number;
  sha256: string;
  detectedMimeType: string | null;
};

export type UploadInspectorOptions = {
  declaredMimeType: string;
  allowedMimeTypes: ReadonlySet<string>;
  maxBytes: number;
  magicBytesLimit?: number;
};

/**
 * Transform stream that validates and fingerprints upload content while passing bytes through.
 *
 * @param options Declared MIME type, allowed set, and upload size constraints.
 */
export class UploadInspectorTransform extends Transform {
  private readonly declaredContentType: string;
  private readonly maxBytes: number;
  private readonly magicBytesLimit: number;
  private readonly hash = createHash("sha256");

  private totalBytes = 0;
  private magicBytes = Buffer.alloc(0);
  private detectedMimeType: string | null = null;
  private finalized = false;
  private digest = "";

  constructor(options: UploadInspectorOptions) {
    super();

    this.declaredContentType = assertAllowedMimeType(
      options.declaredMimeType,
      options.allowedMimeTypes,
    );
    this.maxBytes = options.maxBytes;
    this.magicBytesLimit = options.magicBytesLimit ?? DEFAULT_MAGIC_BYTES_LIMIT;
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    try {
      const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      this.totalBytes += chunkBuffer.length;

      if (this.totalBytes > this.maxBytes) {
        callback(
          new StorageError(
            "MAX_UPLOAD_SIZE_EXCEEDED",
            `Upload exceeds ${this.maxBytes} bytes`,
            {
              statusCode: 413,
              details: {
                maxBytes: this.maxBytes,
                totalBytes: this.totalBytes,
              },
            },
          ),
        );
        return;
      }

      if (this.magicBytes.length < this.magicBytesLimit) {
        const remaining = this.magicBytesLimit - this.magicBytes.length;
        this.magicBytes = Buffer.concat([
          this.magicBytes,
          chunkBuffer.subarray(0, remaining),
        ]);
      }

      this.hash.update(chunkBuffer);
      this.push(chunkBuffer);
      callback();
    } catch (error) {
      callback(
        new StorageError("UPLOAD_STREAM_FAILED", "Upload stream processing failed", {
          details: {
            cause: error instanceof Error ? error.message : "unknown",
          },
        }),
      );
    }
  }

  override _flush(callback: (error?: Error | null) => void): void {
    try {
      this.detectedMimeType = assertMagicBytesMatchMimeType({
        declaredMimeType: this.declaredContentType,
        bytes: this.magicBytes,
      });
      this.digest = this.hash.digest("hex");
      this.finalized = true;
      callback();
    } catch (error) {
      callback(error as Error);
    }
  }

  /**
   * Returns the computed upload metadata after stream completion.
   *
   * @returns Final MIME/content/hash inspection result.
   */
  getResult(): UploadInspectionResult {
    if (!this.finalized) {
      throw new StorageError(
        "UPLOAD_STREAM_FAILED",
        "Upload inspection has not completed yet",
      );
    }

    return {
      contentType: this.declaredContentType,
      contentLength: this.totalBytes,
      sha256: this.digest,
      detectedMimeType: this.detectedMimeType,
    };
  }
}
