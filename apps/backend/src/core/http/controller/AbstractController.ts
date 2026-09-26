import { ZodError } from "zod";

import { AppError } from "#core/error/AppError";
import { InternalError, ValidationError } from "#core/error/http/index";

/**
 * Base controller with centralized error normalization for route handlers.
 */
export abstract class AbstractController {
  /**
   * Executes controller logic and normalizes unexpected errors.
   */
  protected async execute<T>(handler: () => Promise<T>): Promise<T> {
    try {
      return await handler();
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Maps unknown runtime errors into standardized application errors.
   */
  protected handleError(error: unknown): never {
    if (error instanceof AppError) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new ValidationError(ValidationError.DEFAULT_MESSAGE, error.issues);
    }

    throw new InternalError("Unhandled server error", {
      cause: error,
    });
  }
}
