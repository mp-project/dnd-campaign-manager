/**
 * Short ids for URLs: a UUID written in Base58 (no 0/O/I/l), always 22 characters. Lossless both
 * ways, so nothing new is stored and nothing can collide; the API keeps working with UUIDs.
 *
 * A URL segment is `<short id>-<slug>`. Only the short id counts; the slug is there for people
 * and is corrected by a redirect when it no longer fits (renamed content).
 */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58n;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LARGEST = (1n << 128n) - 1n;

export const SHORT_ID_LENGTH = 22;

/** Base58 short id of a UUID; throws on anything that isn't one (a programming error). */
export function toShortId(uuid: string): string {
  if (!UUID_PATTERN.test(uuid)) {
    throw new TypeError(`Not a UUID: ${uuid}`);
  }
  let value = BigInt(`0x${uuid.replaceAll("-", "")}`);
  let digits = "";
  while (value > 0n) {
    digits = ALPHABET[Number(value % BASE)] + digits;
    value /= BASE;
  }
  return digits.padStart(SHORT_ID_LENGTH, ALPHABET[0]);
}

/** The UUID (lower case) of a short id, or null when it isn't one; input comes from URLs. */
export function fromShortId(shortId: string): string | null {
  if (shortId.length !== SHORT_ID_LENGTH) {
    return null;
  }
  let value = 0n;
  for (const char of shortId) {
    const digit = ALPHABET.indexOf(char);
    if (digit < 0) {
      return null;
    }
    value = value * BASE + BigInt(digit);
  }
  if (value > LARGEST) {
    return null;
  }
  const hex = value.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** URL segment `<short id>-<slug>`, or only the short id without a slug. */
export function toRefSegment(id: string, slug?: string | null): string {
  const shortId = toShortId(id);
  return slug ? `${shortId}-${slug}` : shortId;
}

/** Splits a URL segment into the UUID and the slug it carried; null when the short id is invalid. */
export function parseRefSegment(segment: string): { id: string; slug: string } | null {
  const shortId = segment.slice(0, SHORT_ID_LENGTH);
  const rest = segment.slice(SHORT_ID_LENGTH);
  if (rest !== "" && !rest.startsWith("-")) {
    return null;
  }
  const id = fromShortId(shortId);
  return id ? { id, slug: rest.slice(1) } : null;
}
