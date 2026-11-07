export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const REDIRECT_CHECK_ORIGIN = "https://redirect.invalid";

/**
 * Characters browsers drop or reinterpret in URLs: controls, whitespace and the backslash
 * (`/\evil.com` becomes `//evil.com`).
 */
function hasUnsafeRedirectCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f) || character === "\\") {
      return true;
    }
  }

  return false;
}

/**
 * Accepts only a path on the frontend's own origin; everything else becomes "/". Used for every
 * redirect target that came from a client, including error paths.
 */
export function normalizeRedirectPath(input: string): string {
  const value = input.trim();

  if (
    value.length > 500 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    hasUnsafeRedirectCharacter(value)
  ) {
    return "/";
  }

  try {
    // Final check with the browser's own parser: the target must stay on the same origin.
    return new URL(value, REDIRECT_CHECK_ORIGIN).origin === REDIRECT_CHECK_ORIGIN ? value : "/";
  } catch {
    return "/";
  }
}
