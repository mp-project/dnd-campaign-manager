import { type QueryClient, queryOptions, useQuery } from "@tanstack/vue-query";

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
 * Signs out this browser. The session ends on the server first; the cache is cleared either way,
 * so nothing of the account stays in memory even when the request fails.
 */
export async function signOut(queryClient: QueryClient): Promise<void> {
  try {
    await unwrap(api.POST("/api/v1/auth/logout", { body: {} }));
  } finally {
    clearSessionCache(queryClient);
  }
}
