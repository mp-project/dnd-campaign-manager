export const domainErrorCodes = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "VERSION_CONFLICT",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type DomainErrorCode = (typeof domainErrorCodes)[number];

const statusByCode: Record<DomainErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 412,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * Resolves the HTTP status code associated with a domain error code.
 *
 * @param code Domain error code.
 * @returns HTTP status code.
 */
export function statusCodeForDomainError(code: DomainErrorCode): number {
  return statusByCode[code];
}

type DomainErrorParams = {
  code: DomainErrorCode;
  message: string;
  details?: unknown;
};

/**
 * Base application error carrying domain code, details and mapped HTTP status.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  readonly details: unknown;

  readonly statusCode: number;

  constructor(params: DomainErrorParams) {
    super(params.message);
    this.name = "DomainError";
    this.code = params.code;
    this.details = params.details ?? null;
    this.statusCode = statusCodeForDomainError(params.code);
  }
}

/**
 * Error for request validation failures.
 */
export class ValidationError extends DomainError {
  constructor(message: string = "Validation failed", details?: unknown) {
    super({ code: "VALIDATION_ERROR", message, details });
    this.name = "ValidationError";
  }
}

/**
 * Error indicating missing or invalid authentication context.
 */
export class UnauthenticatedError extends DomainError {
  constructor(message: string = "Authentication required", details?: unknown) {
    super({ code: "UNAUTHENTICATED", message, details });
    this.name = "UnauthenticatedError";
  }
}

/**
 * Error indicating the actor is authenticated but not authorized.
 */
export class ForbiddenError extends DomainError {
  constructor(message: string = "Forbidden", details?: unknown) {
    super({ code: "FORBIDDEN", message, details });
    this.name = "ForbiddenError";
  }
}

/**
 * Error indicating that a requested resource does not exist or is hidden.
 */
export class NotFoundError extends DomainError {
  constructor(message: string = "Not found", details?: unknown) {
    super({ code: "NOT_FOUND", message, details });
    this.name = "NotFoundError";
  }
}

/**
 * Error representing generic domain conflicts.
 */
export class ConflictError extends DomainError {
  constructor(message: string = "Conflict", details?: unknown) {
    super({ code: "CONFLICT", message, details });
    this.name = "ConflictError";
  }
}

/**
 * Error representing optimistic-lock style version conflicts.
 */
export class VersionConflictError extends DomainError {
  constructor(message: string = "Version conflict", details?: unknown) {
    super({ code: "VERSION_CONFLICT", message, details });
    this.name = "VersionConflictError";
  }
}

/**
 * Error for throttling and rate-limit violations.
 */
export class RateLimitedError extends DomainError {
  constructor(message: string = "Rate limit exceeded", details?: unknown) {
    super({ code: "RATE_LIMITED", message, details });
    this.name = "RateLimitedError";
  }
}

/**
 * Fallback error for unexpected internal failures.
 */
export class InternalError extends DomainError {
  constructor(message: string = "Internal server error", details?: unknown) {
    super({ code: "INTERNAL_ERROR", message, details });
    this.name = "InternalError";
  }
}