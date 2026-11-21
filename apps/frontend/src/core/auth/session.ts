import { type QueryClient, queryOptions, useQuery } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { cachePolicy } from "@/core/api/cachePolicy";
import { api, type ApiData, unwrap } from "@/core/api/client";
import { clearSessionCache, meKey } from "@/core/api/queryClient";
import { loadClerk } from "@/core/auth/clerk";

/** The signed-in account (`GET /me`): profile, settings and global permissions. */
export type Me = ApiData<"getMe">;

export const meQuery = queryOptions({
  queryKey: meKey("profile"),
  // Asking who is signed in needs Clerk's session (pages that only read the cache never load it).
  queryFn: async (): Promise<Me> => {
    await loadClerk();
    return unwrap(api.GET("/api/v1/me"));
  },
  ...cachePolicy("private"),
});

/** System roles that see and change everything (backend `isSysAdminRole`); campaigns give them the full view. */
const ADMINISTRATOR_ROLES: ReadonlySet<Me["systemRole"]> = new Set(["SYSTEM", "SYSTEM_MAINTAINER", "ADMIN"]);

export function isAdministrator(me: Pick<Me, "systemRole"> | null | undefined): boolean {
  return !!me && ADMINISTRATOR_ROLES.has(me.systemRole);
}

export function useMe() {
  return useQuery(meQuery);
}

/**
 * Ends the session at Clerk: of this browser (`device`), or every session of the account
 * (`everywhere`). The cache is cleared either way, so nothing of the account stays in memory; a
 * failed request still rejects, so the caller can say so.
 */
export async function signOut(queryClient: QueryClient, scope: "device" | "everywhere" = "device"): Promise<void> {
  try {
    const clerk = await loadClerk();
    if (!clerk) return;
    if (scope === "everywhere" && clerk.user) {
      const sessions = await clerk.user.getSessions();
      await Promise.all(sessions.filter((session) => session.id !== clerk.session?.id).map((session) => session.revoke()));
    }
    await clerk.signOut();
  } finally {
    clearSessionCache(queryClient);
  }
}

/**
 * Leaves the app for the sign-in. Signing out everywhere is a security action: if it fails, this
 * browser is still signed out and the sign-in page says that other sessions may remain.
 */
export async function leave(
  queryClient: QueryClient,
  router: Router,
  scope: "device" | "everywhere" = "device",
): Promise<void> {
  if (scope === "everywhere") {
    try {
      await signOut(queryClient, "everywhere");
    } catch {
      await signOut(queryClient).catch(() => undefined);
      await router.push({ name: "auth-login", query: { signedOut: "partial" } });
      return;
    }
  } else {
    await signOut(queryClient).catch(() => undefined);
  }
  await router.push({ name: "auth-login" });
}
