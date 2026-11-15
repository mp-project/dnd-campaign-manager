import { api, unwrap } from "@/core/api/client";

/**
 * Calls of the sign-in pages. None of them needs a session; a successful sign-in sets the session
 * cookies (HttpOnly), so nothing here keeps a token.
 */
export type OAuthProvider = "GOOGLE" | "DISCORD";
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["GOOGLE", "DISCORD"];

export function login(body: { email: string; password: string }) {
  return unwrap(api.POST("/api/v1/auth/login", { body }));
}

/** Always 202, also for a taken address (that one gets an info mail instead of a code). */
/** Language and time zone of this browser, stored as the new account's first settings. */
export type AccountSettings = { locale: string; timezone: string };

export function register(
  body: { email: string; displayName: string; username?: string; password: string; privacyAccepted: true } & AccountSettings,
) {
  return unwrap(api.POST("/api/v1/auth/register", { body }));
}

export function verifyEmail(body: { email: string; verificationCode: string }) {
  return unwrap(api.POST("/api/v1/auth/register/verify-email", { body }));
}

/** Always 202: whether a registration waits for the address stays unknown. */
export function requestVerification(body: { email: string }) {
  return unwrap(api.POST("/api/v1/auth/register/request-verification", { body }));
}

/** Always 202: whether an account exists stays unknown. */
export function forgotPassword(body: { email: string; locale: string }) {
  return unwrap(api.POST("/api/v1/auth/forgot-password", { body }));
}

export function resetPassword(body: { token: string; newPassword: string }) {
  return unwrap(api.POST("/api/v1/auth/reset-password", { body }));
}

/** After the provider confirmed the account and no account exists yet (signed onboarding cookie). */
export function completeOAuthRegistration(
  body: { displayName: string; username?: string; privacyAccepted: true } & AccountSettings,
) {
  return unwrap(api.POST("/api/v1/auth/oauth/complete-registration", { body }));
}

/**
 * The provider's sign-in is a full page navigation through the API, which redirects to the
 * provider and back to `/login/oauth`.
 */
export function oauthStartUrl(provider: OAuthProvider, intent: "login" | "register", redirect: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/+$/, "");
  const query = new URLSearchParams({ intent, redirect });
  return `${base}/auth/oauth/${provider}/start?${query.toString()}`;
}
