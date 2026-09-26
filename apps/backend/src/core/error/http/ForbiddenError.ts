import { DomainError } from "#core/error/http/DomainError";

/**
 * Error indicating the actor is authenticated but not authorized.
 */
export class ForbiddenError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Forbidden";

  constructor(message: string = ForbiddenError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "FORBIDDEN", message, details });
    this.name = "ForbiddenError";
  }
}
