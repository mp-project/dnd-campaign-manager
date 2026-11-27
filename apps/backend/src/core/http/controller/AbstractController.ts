import { ZodError } from "zod";

import { AppError } from "#core/error/AppError";
import { isDatabaseBusyError } from "#core/error/databaseBusy";
import {
  InternalError,
  ServiceUnavailableError,
  ValidationError,
} from "#core/error/http/index";
import { type HttpHeaders, HttpResponse } from "#core/http/httpResponse";

/**
 * Base controller with centralized error normalization for route handlers and the answers they give
 * (`ok`, `created`, `accepted`, `noContent`), which routes send with `sendHttpResponse`.
 */
export abstract class AbstractController {
  protected ok<T>(data: T, headers?: HttpHeaders): HttpResponse<T> {
    return new HttpResponse(200, data, headers);
  }

  /** `location`, when given, becomes the `Location` header of the new resource. */
  protected created<T>(data: T, location?: string): HttpResponse<T> {
    return new HttpResponse(201, data, location === undefined ? {} : { location });
  }

  protected accepted<T>(data: T): HttpResponse<T> {
    return new HttpResponse(202, data);
  }

  protected noContent(): HttpResponse<undefined> {
    return new HttpResponse(204, undefined);
  }

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
      throw new ValidationError(ValidationError.DEFAULT_MESSAGE, error.issues, { cause: error });
    }

    if (isDatabaseBusyError(error)) {
      throw new ServiceUnavailableError(undefined, undefined, { cause: error });
    }

    // The cause is logged and reported by the error handler, never sent to the client.
    throw new InternalError("Unhandled server error", undefined, { cause: error });
  }
}
