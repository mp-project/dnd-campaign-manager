import { UnauthorizedError } from "#core/error/http/UnauthorizedError";

/**
 * Backward-compatible alias for UnauthorizedError.
 */
export class UnauthenticatedError extends UnauthorizedError {
  constructor(
    message: string = UnauthorizedError.DEFAULT_MESSAGE,
    details?: unknown,
  ) {
    super(message, details);
    this.name = "UnauthenticatedError";
  }
}
