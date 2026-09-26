import { DomainError } from "#core/error/http/DomainError";

/**
 * Error indicating missing or invalid authentication context.
 */
export class UnauthorizedError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Unauthorized";

  constructor(message: string = UnauthorizedError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "UNAUTHENTICATED", message, details });
    this.name = "UnauthorizedError";
  }
}
