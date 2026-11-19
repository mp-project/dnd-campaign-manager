import { errorMessageKey, isApiError } from "@/core/api/errors";
import { useAppI18n } from "@/core/i18n";

/**
 * Why answering an invitation failed. Only what the answer names counts: 404 (gone or foreign),
 * `details.reason` of a 409 (`expired`, `changed`, `member`) or a 403 (`unverified`). Anything else
 * is a general error, which leaves the token alone.
 */
type Outcome = "notFound" | "expired" | "changed" | "member" | "unverified" | "other";

const REASONS = new Set(["expired", "changed", "member", "unverified"]);

function outcomeOf(error: unknown): Outcome {
  if (!isApiError(error)) return "other";
  if (error.status === 404) return "notFound";
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  if ((error.status === 409 || error.status === 403) && typeof reason === "string" && REASONS.has(reason)) {
    return reason as Outcome;
  }
  return "other";
}

/**
 * The account's own invitation can't be answered any more (expired, answered or taken back, a member
 * already): its token is worth nothing, also for another account.
 */
export function isUsedUpInvitationError(error: unknown): boolean {
  const outcome = outcomeOf(error);
  return outcome === "expired" || outcome === "changed" || outcome === "member";
}

/**
 * The invitation is no longer this account's to answer (gone, foreign or used up): a list showing it
 * should load again. A 404 may also mean the wrong account is signed in, so a token is kept for that
 * (`isUsedUpInvitationError`).
 */
export function isGoneInvitationError(error: unknown): boolean {
  return outcomeOf(error) === "notFound" || isUsedUpInvitationError(error);
}

/** What to tell the invited person when accepting or declining fails. */
export function useInvitationErrorText() {
  const { t } = useAppI18n();
  return (error: unknown): string => {
    const outcome = outcomeOf(error);
    // i18n-dynamic: campaign-invitations.errors.*
    return outcome === "other" ? t(errorMessageKey(error)) : t(`campaign-invitations.errors.${outcome}`);
  };
}
