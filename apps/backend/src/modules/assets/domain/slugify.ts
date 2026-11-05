import { randomUUID } from "node:crypto";

const MAX_SLUG_LENGTH = 220;
const SUFFIX_LENGTH = 8;

/**
 * The slug rule of all assets: accents dropped, lower case, everything else becomes a dash.
 *
 * With `unique`, a random suffix is added, for content whose names may repeat and which is found by
 * id anyway, such as notes. `fallback` is used when nothing of the title is left, e.g. for titles
 * in other scripts; without it the result can be empty.
 */
export function slugify(
  title: string,
  options: { unique?: boolean; fallback?: string } = {},
): string {
  const maxLength = options.unique ? MAX_SLUG_LENGTH - SUFFIX_LENGTH - 1 : MAX_SLUG_LENGTH;
  const base =
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, maxLength)
      .replace(/-+$/, "") || (options.fallback ?? "");

  if (!options.unique) {
    return base;
  }

  const suffix = randomUUID().replaceAll("-", "").slice(0, SUFFIX_LENGTH);

  return base ? `${base}-${suffix}` : suffix;
}
