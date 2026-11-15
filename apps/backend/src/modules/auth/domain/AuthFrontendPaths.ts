/**
 * Pages of the frontend that auth emails and redirects lead to. They are routes of the frontend's
 * `auth` module; a change here needs the same change there.
 */
export const AUTH_FRONTEND_PATHS = {
  /** Sign-in; `?verified=1|0` after the registration link, `?reset=1` after a password reset. */
  login: "/login",
  /** Back from an OAuth provider: `?status=success|registration_required|error&redirect=…[&code=…]`. */
  oauthCallback: "/login/oauth",
  /** New password from the emailed link: `?token=…`. */
  passwordReset: "/passwort-zuruecksetzen",
} as const;
