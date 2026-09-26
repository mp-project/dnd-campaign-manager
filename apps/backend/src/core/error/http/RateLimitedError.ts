import { DomainError } from "#core/error/http/DomainError";

/**
 * Error for throttling and rate-limit violations.
 */
export class RateLimitedError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Rate limit exceeded";

  constructor(message: string = RateLimitedError.DEFAULT_MESSAGE, details?: unknown) {
    super({ code: "RATE_LIMITED", message, details });
    this.name = "RateLimitedError";
  }
}
