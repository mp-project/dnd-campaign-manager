import { AppError } from "#core/error/AppError";

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
export class StorageError extends AppError<StorageErrorCode> {
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
    super(code, message, options);
    this.name = "StorageError";
  }
}
