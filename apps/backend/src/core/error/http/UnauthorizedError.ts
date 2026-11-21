import { DomainError } from "#core/error/http/DomainError";

/**
 * Error indicating missing or invalid authentication context.
 */
export class UnauthorizedError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Unauthorized";

  constructor(
    message: string = UnauthorizedError.DEFAULT_MESSAGE,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super({ code: "UNAUTHENTICATED", message, details, cause: options?.cause });
    this.name = "UnauthorizedError";
  }
}
