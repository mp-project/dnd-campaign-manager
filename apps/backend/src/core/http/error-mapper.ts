import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from "fastify-type-provider-zod";

import {
  DomainError,
  type DomainErrorCode,
  statusCodeForDomainError,
} from "#core/http/domain-errors";

export type MappedHttpError = {
  statusCode: number;
  code: DomainErrorCode;
  message: string;
  details?: unknown;
};

type ErrorWithStatusCode = {
  statusCode?: number;
  code?: string;
  message?: string;
  detail?: string;
  details?: unknown;
};

function asErrorWithStatusCode(error: unknown): ErrorWithStatusCode {
  if (typeof error === "object" && error !== null) {
    return error as ErrorWithStatusCode;
  }

  return {};
}

function isPgConflict(error: ErrorWithStatusCode): boolean {
  return (
    error.code === "23505" ||
    error.code === "23503" ||
    error.code === "23514"
  );
}

function mapStatusCodeToDomainCode(statusCode: number): DomainErrorCode {
  if (statusCode === 400) {
    return "VALIDATION_ERROR";
  }

  if (statusCode === 401) {
    return "UNAUTHENTICATED";
  }

  if (statusCode === 403) {
    return "FORBIDDEN";
  }

  if (statusCode === 404) {
    return "NOT_FOUND";
  }

  if (statusCode === 409) {
    return "CONFLICT";
  }

  if (statusCode === 429) {
    return "RATE_LIMITED";
  }

  return "INTERNAL_ERROR";
}

export function mapErrorToHttp(error: unknown): MappedHttpError {
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: error.validation,
    };
  }

  if (error instanceof DomainError) {
    return {
      statusCode: statusCodeForDomainError(error.code),
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  const candidate = asErrorWithStatusCode(error);

  if (candidate.code === "VERSION_CONFLICT") {
    return {
      statusCode: 409,
      code: "VERSION_CONFLICT",
      message: candidate.message ?? "Version conflict",
      details: candidate.details ?? null,
    };
  }

  if (candidate.statusCode === 429 || candidate.code === "FST_ERR_RATE_LIMIT") {
    return {
      statusCode: 429,
      code: "RATE_LIMITED",
      message: candidate.message ?? "Rate limit exceeded",
      details: null,
    };
  }

  if (isPgConflict(candidate)) {
    return {
      statusCode: 409,
      code: "CONFLICT",
      message: "Database conflict",
      details: candidate.detail ?? null,
    };
  }

  if (isResponseSerializationError(error)) {
    return {
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      details: null,
    };
  }

  if (typeof candidate.statusCode === "number") {
    const statusCode = candidate.statusCode >= 400 ? candidate.statusCode : 500;

    return {
      statusCode,
      code: mapStatusCodeToDomainCode(statusCode),
      message:
        candidate.message ??
        (statusCode >= 500 ? "Internal server error" : "Request failed"),
      details: null,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: null,
  };
}
