type AppErrorParams = {
  statusCode?: number;
  details?: unknown;
  /** The error this one translates; logged with it, never sent to the client. */
  cause?: unknown;
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
    super(message, params.cause === undefined ? undefined : { cause: params.cause });
    this.name = "AppError";
    this.code = code;
    this.statusCode = params.statusCode ?? 500;
    this.details = params.details ?? null;
  }
}
