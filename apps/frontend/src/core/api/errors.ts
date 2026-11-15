/**
 * API errors as the frontend sees them. The backend answers every error with
 * `{ error: { code, message, details, requestId } }`; the `code` is what the UI translates
 * (`errors.<code>`), `message` is only for logs.
 */

export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VERSION_CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

/** `NETWORK_ERROR`: no answer at all (offline, server down); `UNKNOWN_ERROR`: an answer without the error envelope. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number] | "NETWORK_ERROR" | "UNKNOWN_ERROR";

/** One field the server refused to merge on a 412 (history conflict). */
export type VersionConflictField = {
  field: string;
  changedBy?: string | null;
  yours?: unknown;
  current?: unknown;
};

export type VersionConflictDetails = {
  currentVersion: number | null;
  conflicts: VersionConflictField[];
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(params: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
  }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details ?? null;
    this.requestId = params.requestId ?? null;
    this.retryAfterSeconds = params.retryAfterSeconds ?? null;
  }
}

type ErrorEnvelope = {
  error: { code: string; message: string; details?: unknown; requestId?: string };
};

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function isKnownCode(code: string): code is (typeof API_ERROR_CODES)[number] {
  return (API_ERROR_CODES as readonly string[]).includes(code);
}

function retryAfterOf(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

/** Builds the `ApiError` for a failed response and its (already parsed) body. */
export function toApiError(response: Response, body: unknown): ApiError {
  if (isErrorEnvelope(body)) {
    return new ApiError({
      status: response.status,
      code: isKnownCode(body.error.code) ? body.error.code : "UNKNOWN_ERROR",
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId ?? null,
      retryAfterSeconds: retryAfterOf(response),
    });
  }

  return new ApiError({
    status: response.status,
    code: "UNKNOWN_ERROR",
    message: `Request failed with status ${response.status}`,
    retryAfterSeconds: retryAfterOf(response),
  });
}

export function networkError(cause: unknown): ApiError {
  return new ApiError({
    status: 0,
    code: "NETWORK_ERROR",
    message: cause instanceof Error ? cause.message : "Network request failed",
  });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** 412: somebody else changed the content since it was loaded (optimistic locking). */
export function isVersionConflict(
  error: unknown,
): error is ApiError & { code: "VERSION_CONFLICT" } {
  return isApiError(error) && error.code === "VERSION_CONFLICT";
}

/**
 * What the editor needs to offer "reload" or "keep my change": the current version and the
 * fields that conflict. Plain optimistic-lock conflicts carry no field list.
 */
export function versionConflictDetails(error: ApiError): VersionConflictDetails {
  const details = (error.details ?? {}) as Partial<VersionConflictDetails>;
  return {
    currentVersion: typeof details.currentVersion === "number" ? details.currentVersion : null,
    conflicts: Array.isArray(details.conflicts) ? details.conflicts : [],
  };
}
