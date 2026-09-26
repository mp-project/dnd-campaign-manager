type AppErrorParams = {
  statusCode?: number;
  details?: unknown;
};

/**
 * Shared base class for all structured application errors.
 */
export class AppError<TCode extends string = string> extends Error {
  readonly code: TCode;

  readonly statusCode: number;

  readonly details: unknown;

  constructor(
    code: TCode,
    message: string,
    params: AppErrorParams = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = params.statusCode ?? 500;
    this.details = params.details ?? null;
  }
}
