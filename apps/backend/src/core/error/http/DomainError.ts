import { CustomApiError } from "#core/error/http/CustomApiError";
import {
  statusCodeForDomainError,
  type DomainErrorCode,
} from "#core/error/http/codes";

export type DomainErrorOverrides = {
  details?: unknown;
};

type DomainErrorParams = DomainErrorOverrides & {
  code: DomainErrorCode;
  message: string;
};

/**
 * Base application error carrying domain code, details and mapped HTTP status.
 */
export class DomainError extends CustomApiError<DomainErrorCode> {
  constructor(params: DomainErrorParams) {
    super(
      params.code,
      params.message,
      statusCodeForDomainError(params.code),
      params.details,
    );
    this.name = "DomainError";
  }
}
