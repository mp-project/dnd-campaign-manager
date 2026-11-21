import { DomainError } from "#core/error/http/DomainError";

/**
 * Fallback error for unexpected internal failures.
 */
export class InternalError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Internal server error";

  constructor(
    message: string = InternalError.DEFAULT_MESSAGE,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super({ code: "INTERNAL_ERROR", message, details, cause: options?.cause });
    this.name = "InternalError";
  }
}
