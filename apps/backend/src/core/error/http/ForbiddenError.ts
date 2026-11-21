import { DomainError } from "#core/error/http/DomainError";

/**
 * Error indicating the actor is authenticated but not authorized.
 */
export class ForbiddenError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Forbidden";

  constructor(
    message: string = ForbiddenError.DEFAULT_MESSAGE,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super({ code: "FORBIDDEN", message, details, cause: options?.cause });
    this.name = "ForbiddenError";
  }
}
