import { DomainError } from "#core/error/http/DomainError";

/**
 * Error representing optimistic-lock style version conflicts.
 */
export class VersionConflictError extends DomainError {
  static readonly DEFAULT_MESSAGE = "Version conflict";

  constructor(
    message: string = VersionConflictError.DEFAULT_MESSAGE,
    details?: unknown,
    options?: ErrorOptions,
  ) {
    super({ code: "VERSION_CONFLICT", message, details, cause: options?.cause });
    this.name = "VersionConflictError";
  }
}
