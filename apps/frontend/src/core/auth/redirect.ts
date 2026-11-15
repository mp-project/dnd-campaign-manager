/**
 * Where to go after signing in: only paths of this app (like the backend's `normalizeRedirectPath`).
 * Other origins (`https://…`, `//host`, `/\host`), the sign-in pages and anything that isn't a path
 * lead to the dashboard.
 */
export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

/** The sign-in pages themselves are no target: signing in would end where it started. */
const SIGN_IN_PATHS = ["/login", "/registrieren", "/aktivierung", "/passwort-vergessen", "/passwort-zuruecksetzen"];

function isSignInPage(path: string): boolean {
  return SIGN_IN_PATHS.some((page) => path === page || path.startsWith(`${page}/`));
}

export function safeRedirectPath(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return DEFAULT_SIGNED_IN_PATH;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return DEFAULT_SIGNED_IN_PATH;

  try {
    // Control characters or a scheme hidden behind encoding would change the origin.
    const url = new URL(path, "http://app.invalid");
    if (url.origin !== "http://app.invalid") return DEFAULT_SIGNED_IN_PATH;
    if (url.pathname === "/" || isSignInPage(url.pathname.replace(/\/+$/, ""))) return DEFAULT_SIGNED_IN_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_SIGNED_IN_PATH;
  }
}
