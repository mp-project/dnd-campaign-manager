/**
 * What Faro may send about addresses. Queries and fragments carry tokens and email addresses
 * (`/passwort-zuruecksetzen?token=`, `/invitations/accept#token=`), slugs carry campaign and content
 * names (`/k/<short id>-<name>`). Every address in an item keeps its path with the short ids only;
 * those are pseudonymous and enough to tell pages apart.
 */
const SHORT_ID_WITH_SLUG = /\/([1-9A-HJ-NP-Za-km-z]{22})-[^/?#\s]+/g;
const ADDRESS = /^(https?:\/\/|\/)/;
const MAX_DEPTH = 12;

export function scrubAddress(value: string): string {
  if (!ADDRESS.test(value)) return value;
  const cut = value.search(/[?#]/);
  const withoutQuery = cut === -1 ? value : value.slice(0, cut);
  return withoutQuery.replace(SHORT_ID_WITH_SLUG, "/$1");
}

/** Returns a copy of `value` with every address scrubbed (strings anywhere in objects and arrays). */
export function scrubAddresses<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubAddress(value) as T;
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry: unknown) => scrubAddresses(entry, depth + 1)) as T;

  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) copy[key] = scrubAddresses(entry, depth + 1);
  return copy as T;
}
