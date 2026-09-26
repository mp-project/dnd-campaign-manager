import { DomainError } from "#core/error/http/DomainError";

/**
 * Error representing generic domain conflicts.
 */
export class ConflictError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Conflict";

  constructor(message: string = ConflictError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "CONFLICT", message, details });
    this.name = "ConflictError";
  }
}
