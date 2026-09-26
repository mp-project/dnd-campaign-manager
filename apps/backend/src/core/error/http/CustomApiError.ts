import { AppError } from "#core/error/AppError";

/**
 * Default base class for all HTTP/API-facing application errors.
 */
export class CustomApiError<TCode extends string = string> extends AppError<TCode> {
  constructor(
    code: TCode,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(code, message, {
      statusCode,
      details,
    });

    this.name = "CustomApiError";
  }
}
