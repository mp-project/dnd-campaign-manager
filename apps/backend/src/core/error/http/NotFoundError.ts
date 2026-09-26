import { DomainError } from "#core/error/http/DomainError";

/**
 * Error indicating that a requested resource does not exist or is hidden.
 */
export class NotFoundError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Not found";

  constructor(message: string = NotFoundError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "NOT_FOUND", message, details });
    this.name = "NotFoundError";
  }
}
