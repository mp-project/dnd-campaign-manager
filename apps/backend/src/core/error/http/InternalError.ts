import { DomainError } from "#core/error/http/DomainError";

/**
 * Fallback error for unexpected internal failures.
 */
export class InternalError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Internal server error";

  constructor(message: string = InternalError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "INTERNAL_ERROR", message, details });
    this.name = "InternalError";
  }
}
