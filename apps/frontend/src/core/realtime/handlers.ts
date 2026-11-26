import type { InvalidateMessage, RealtimeResource } from "@dnd/contracts";
import type { QueryClient } from "@tanstack/vue-query";

import { campaignKey, meKey } from "@/core/api/queryClient";

/**
 * What a module does when the server says one of its resources changed: usually invalidating its
 * queries, which loads them again through the API (where the rights are decided). Modules list
 * theirs as `realtime` in `defineFrontendModule`.
 */
export type RealtimeHandler = {
  resource: RealtimeResource;
  invalidate(message: InvalidateMessage, queryClient: QueryClient): Promise<void> | void;
};

/**
 * The app's own resources. A changed campaign (or the viewer's membership in it) loads the
 * campaign again: `watchCampaignAccess` then notices a changed role or a lost campaign and acts.
 */
export const CORE_REALTIME_HANDLERS: readonly RealtimeHandler[] = [
  {
    resource: "account",
    invalidate: (_message, queryClient) => queryClient.invalidateQueries({ queryKey: meKey() }),
  },
  {
    resource: "campaign",
    invalidate: async (message, queryClient) => {
      if (!message.campaignId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: campaignKey(message.campaignId, "detail") }),
        queryClient.invalidateQueries({ queryKey: meKey("campaigns") }),
      ]);
    },
  },
];

/** Runs every handler of the message's resource; unknown resources (no page uses them yet) are ignored. */
export async function dispatchInvalidate(
  message: InvalidateMessage,
  handlers: readonly RealtimeHandler[],
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all(
    handlers
      .filter((handler) => handler.resource === message.resource)
      .map((handler) => handler.invalidate(message, queryClient)),
  );
}
