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
