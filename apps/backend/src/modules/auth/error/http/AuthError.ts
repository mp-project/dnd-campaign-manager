import { CustomApiError } from "#core/error/http/index";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_VERIFIED"
  | "SESSION_INVALID"
  | "PASSWORD_RESET_INVALID"
  | "PASSWORD_RESET_EXPIRED"
  | "PASSWORD_RESET_USED"
  | "OAUTH_PROVIDER_UNAVAILABLE"
  | "OAUTH_STATE_INVALID"
  | "OAUTH_CALLBACK_FAILED"
  | "OAUTH_VERIFIED_EMAIL_REQUIRED"
  | "OAUTH_REGISTRATION_REQUIRED"
  | "OAUTH_IDENTITY_CONFLICT";

const statusByCode: Record<AuthErrorCode, number> = {
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_VERIFIED: 409,
  SESSION_INVALID: 401,
  PASSWORD_RESET_INVALID: 409,
  PASSWORD_RESET_EXPIRED: 409,
  PASSWORD_RESET_USED: 409,
  OAUTH_PROVIDER_UNAVAILABLE: 503,
  OAUTH_STATE_INVALID: 401,
  OAUTH_CALLBACK_FAILED: 401,
  OAUTH_VERIFIED_EMAIL_REQUIRED: 409,
  OAUTH_REGISTRATION_REQUIRED: 409,
  OAUTH_IDENTITY_CONFLICT: 409,
};

export class AuthError extends CustomApiError<AuthErrorCode> {
  constructor(code: AuthErrorCode, message: string, details?: unknown) {
    super(code, message, statusByCode[code], details);
    this.name = "AuthError";
  }
}
