import { QueryClient } from "@tanstack/vue-query";

import { isApiError } from "@/core/api/errors";

/**
 * Query keys start with their scope, so whole scopes can be dropped at once:
 * `["global", …]` (catalog, rulesets), `["me", …]` (account), `["campaign", campaignId, …]`.
 */
export const globalKey = (...parts: readonly unknown[]) => ["global", ...parts] as const;
export const meKey = (...parts: readonly unknown[]) => ["me", ...parts] as const;
export const campaignKey = (campaignId: string, ...parts: readonly unknown[]) =>
  ["campaign", campaignId, ...parts] as const;

/** 4xx answers won't change by asking again (rights, validation, conflicts); the rest gets two retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) {
    return error.status === 408 && failureCount < 2;
  }
  return failureCount < 2;
}

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 0 },
      // Writes are never repeated on their own: the history would record them twice.
      mutations: { retry: false },
    },
  });
}

/** Logout or expired session: nothing of the previous user may stay in memory. */
export function clearSessionCache(queryClient: QueryClient): void {
  queryClient.clear();
}

/**
 * Leaving a campaign, or a changed role in it: its data was loaded with other rights (GM fields,
 * drafts, shares), so it is dropped instead of refetched in place.
 */
export function clearCampaignCache(queryClient: QueryClient, campaignId: string): void {
  queryClient.removeQueries({ queryKey: campaignKey(campaignId) });
}
