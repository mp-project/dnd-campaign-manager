import { DomainError } from "#core/error/http/DomainError";

/**
 * Error for request validation failures.
 */
export class ValidationError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Validation failed";

  constructor(message: string = ValidationError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "VALIDATION_ERROR", message, details });
    this.name = "ValidationError";
  }
}
