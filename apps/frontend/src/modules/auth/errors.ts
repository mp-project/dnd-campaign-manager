import { errorMessageKey, isApiError } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";

/**
 * The text for a failed auth request. Blocked attempts say when to try again (`Retry-After`),
 * everything else comes from the error code.
 */
export function useAuthErrorText() {
  const { t } = useAppI18n();

  return function errorText(error: unknown): string {
    if (isApiError(error) && error.code === "RATE_LIMITED" && error.retryAfterSeconds) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      return t("auth.errors.retryAfter", minutes, { minutes });
    }
    return t(errorMessageKey(error));
  };
}
