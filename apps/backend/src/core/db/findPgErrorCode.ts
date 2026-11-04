/** Finds the PostgreSQL error code, which drizzle may wrap in `cause`. */
export function findPgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  const maybeCode = (error as { code?: unknown }).code;

  if (typeof maybeCode === "string") {
    return maybeCode;
  }

  return findPgErrorCode((error as { cause?: unknown }).cause);
}
