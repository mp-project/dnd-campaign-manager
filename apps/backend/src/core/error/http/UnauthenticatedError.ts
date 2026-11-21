import { UnauthorizedError } from "#core/error/http/UnauthorizedError";

/**
 * Backward-compatible alias for UnauthorizedError.
 */
export class UnauthenticatedError extends UnauthorizedError {
  constructor(
    message: string = UnauthorizedError.DEFAULT_MESSAGE,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, details, options);
    this.name = "UnauthenticatedError";
  }
}
