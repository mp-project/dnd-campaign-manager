import { DomainError } from "#core/error/http/DomainError";

/**
 * Error for temporary overload, for example when the database is too busy to answer in time.
 */
export class ServiceUnavailableError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Service temporarily unavailable";

  constructor(message: string = ServiceUnavailableError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "SERVICE_UNAVAILABLE", message, details });
    this.name = "ServiceUnavailableError";
  }
}
