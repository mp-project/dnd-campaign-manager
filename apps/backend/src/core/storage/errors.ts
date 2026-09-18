export type StorageErrorCode =
  | "INVALID_KEY"
  | "NOT_FOUND"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "CONTENT_TYPE_MISMATCH"
  | "INVALID_MAGIC_BYTES"
  | "MAX_UPLOAD_SIZE_EXCEEDED"
  | "UPLOAD_STREAM_FAILED"
  | "S3_CONFIGURATION_ERROR";

/**
 * Domain error type for storage operations with HTTP-friendly metadata.
 */
export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly statusCode: number;
  readonly details: unknown;

  /**
   * @param code Stable error code used by callers and HTTP mappers.
   * @param message Human-readable error message.
   * @param options Optional HTTP status and structured diagnostics.
   */
  constructor(
    code: StorageErrorCode,
    message: string,
    options: { statusCode?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details ?? null;
  }
}
