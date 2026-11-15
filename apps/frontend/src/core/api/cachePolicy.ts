import { keepPreviousData } from "@tanstack/vue-query";

/**
 * The one table of cache rules (plan 4.4). Every query names its kind of data; modules don't set
 * `staleTime`/`gcTime` themselves.
 *
 * - `static`: rarely changed master data (ruleset, catalog filters).
 * - `content`: campaign content (locations, persons, compendium); realtime and own mutations invalidate it.
 * - `list`: filtered/paged lists; keeps the previous page while the next one loads.
 * - `live`: state others change while you look at it (inventory, markers, RSVPs); always refetched.
 * - `private`: sensitive or role-dependent data (GM fields, history, own notes, account, sessions).
 * - `signedUrl`: short-lived links (signed media URLs); never kept.
 *
 * Nothing is persisted to storage. Logout clears everything, a role or campaign change clears the
 * campaign's queries (`queryClient.ts`).
 */
export type CacheKind = "static" | "content" | "list" | "live" | "private" | "signedUrl";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type CacheRule = {
  staleTime: number;
  gcTime: number;
  refetchOnWindowFocus: boolean | "always";
  refetchOnReconnect: boolean | "always";
  placeholderData?: typeof keepPreviousData;
};

export const CACHE_POLICY: Readonly<Record<CacheKind, CacheRule>> = {
  static: { staleTime: 6 * HOUR, gcTime: 24 * HOUR, refetchOnWindowFocus: false, refetchOnReconnect: false },
  content: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE, refetchOnWindowFocus: true, refetchOnReconnect: true },
  list: {
    staleTime: MINUTE,
    gcTime: 10 * MINUTE,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  },
  live: { staleTime: 0, gcTime: 5 * MINUTE, refetchOnWindowFocus: "always", refetchOnReconnect: "always" },
  private: { staleTime: 30_000, gcTime: 5 * MINUTE, refetchOnWindowFocus: true, refetchOnReconnect: true },
  signedUrl: { staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false },
};

/**
 * Query options for one kind of data, to spread into `useQuery`:
 *
 *   useQuery({ queryKey: campaignKey(id, "locations", filters), queryFn, ...cachePolicy("list") })
 */
export function cachePolicy(kind: CacheKind): CacheRule {
  return CACHE_POLICY[kind];
}
