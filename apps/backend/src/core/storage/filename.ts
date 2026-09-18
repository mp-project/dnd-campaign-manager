import path from "node:path";

const MAX_FILENAME_LENGTH = 120;

/**
 * Removes unsafe filename characters and collapses whitespace.
 *
 * @param value Raw filename input.
 * @returns Sanitized filename fragment.
 */
function stripUnsafeCharacters(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Normalizes untrusted filenames to a safe, deterministic representation.
 *
 * @param value Original filename from client input.
 * @param fallback Name used when sanitization removes all meaningful characters.
 * @returns Safe basename including a lowercase extension when present.
 */
export function normalizeFilename(value: string, fallback = "file"): string {
  const posixSafe = value.replace(/\\/g, "/");
  const basename = path.posix.basename(posixSafe).normalize("NFKC");
  const sanitized = stripUnsafeCharacters(basename);
  const effective = sanitized.length > 0 ? sanitized : fallback;

  const ext = path.extname(effective).toLowerCase();
  const rawName = ext.length > 0 ? effective.slice(0, -ext.length) : effective;
  const trimmedName = rawName.slice(0, Math.max(1, MAX_FILENAME_LENGTH - ext.length));

  return `${trimmedName}${ext}`;
}

/**
 * Extracts and normalizes the file extension from a filename.
 *
 * @param value Filename to inspect.
 * @returns Lowercase extension including leading dot, or null when absent.
 */
export function extensionFromFilename(value: string): string | null {
  const ext = path.extname(value).toLowerCase();

  if (!ext || ext === ".") {
    return null;
  }

  return ext;
}
