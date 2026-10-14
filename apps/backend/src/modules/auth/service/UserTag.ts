import { randomInt } from "node:crypto";

export function usernameFromDisplayName(displayName: string): string {
  const username = displayName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");

  return username.length >= 3 ? username : "player";
}

export async function generateUniqueUserTag(
  username: string,
  exists: (userTag: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const userTag = `${username}#${randomInt(0, 1_000_000).toString().padStart(6, "0")}`;

    if (!(await exists(userTag))) {
      return userTag;
    }
  }

  throw new Error("Could not allocate a unique user tag");
}