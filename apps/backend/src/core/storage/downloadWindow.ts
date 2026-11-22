/**
 * Download links are signed at the start of the current window of `ttlSeconds` and last two
 * windows, so a link stays the same within a window (the browser can use its cache) and is valid
 * for at least `ttlSeconds` from now.
 */
export function downloadUrlWindow(
  ttlSeconds: number,
  now: number = Date.now(),
): { signedAt: Date; expiresAt: Date } {
  const windowMs = ttlSeconds * 1000;
  const start = Math.floor(now / windowMs) * windowMs;

  return { signedAt: new Date(start), expiresAt: new Date(start + 2 * windowMs) };
}
