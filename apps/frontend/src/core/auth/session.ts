import { type QueryClient, queryOptions, useQuery } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { cachePolicy } from "@/core/api/cachePolicy";
import { api, type ApiData, unwrap } from "@/core/api/client";
import { clearSessionCache, meKey } from "@/core/api/queryClient";

/** The signed-in account (`GET /me`): profile, settings and global permissions. */
export type Me = ApiData<"getMe">;

export const meQuery = queryOptions({
  queryKey: meKey("profile"),
  queryFn: (): Promise<Me> => unwrap(api.GET("/api/v1/me")),
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
 * Ends the session: of this browser (`device`), or of every browser and device of the account
 * including trusted devices (`everywhere`). The cache is cleared either way, so nothing of the
 * account stays in memory; a failed request still rejects, so the caller can say so.
 */
export async function signOut(queryClient: QueryClient, scope: "device" | "everywhere" = "device"): Promise<void> {
  try {
    await unwrap(
      scope === "everywhere" ? api.POST("/api/v1/auth/logout-all") : api.POST("/api/v1/auth/logout", { body: {} }),
    );
  } finally {
    clearSessionCache(queryClient);
  }
}

/**
 * Leaves the app for the sign-in. This browser is always signed out, even if the server can't be
 * reached (the session cookie expires on its own). Signing out everywhere is a security action:
 * if it fails, this browser is still signed out and the sign-in page says that other sessions may
 * remain.
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
