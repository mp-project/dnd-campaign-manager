import type { QueryClient } from "@tanstack/vue-query";
import type { Router } from "vue-router";

import { isApiError } from "@/core/api/errors";
import { campaignKey, meKey } from "@/core/api/queryClient";
import { campaignIdOfParam, type CampaignRole, lastCampaignId, rememberCampaign } from "@/core/campaign/campaign";

/**
 * Notices when the viewer's role in a campaign changes or the membership ends while the app is
 * open, and acts at once:
 * - everything of that campaign loaded with the old rights is dropped (GM fields, drafts, shares);
 * - if a page of that campaign is open, its guard runs again: a new player gets the player view,
 *   somebody who left gets the not-found page;
 * - the account's campaign list is loaded again.
 *
 * What makes it notice: the realtime channel reports a changed membership (`invalidate` of the
 * resource `campaign`, which reloads the campaign); the campaign is also reloaded on navigation
 * when stale, every minute while open and the channel is not connected (`CAMPAIGN_ACCESS_CHECK_MS`),
 * and right away when the API refuses something in the campaign (403/404 are the clearest hint
 * that the rights changed).
 */
export function watchCampaignAccess(router: Router, queryClient: QueryClient): () => void {
  const knownRoles = new Map<string, CampaignRole | null>();
  let navigating = false;
  const unhookBefore = router.beforeEach(() => {
    navigating = true;
  });
  const unhookAfter = router.afterEach(() => {
    navigating = false;
  });

  const isDetail = (key: readonly unknown[]) => key[0] === "campaign" && key[2] === "detail";
  const currentCampaignId = () => campaignIdOfParam(router.currentRoute.value.params.campaign);

  function recheckCampaign(campaignId: string): void {
    void queryClient.refetchQueries({ queryKey: campaignKey(campaignId, "detail") });
  }

  function rerunGuardIfOpen(campaignId: string): void {
    // During a navigation its guard decides with the fresh data itself.
    if (navigating || currentCampaignId() !== campaignId) return;
    void router.replace({ path: router.currentRoute.value.fullPath, force: true });
  }

  function dropCampaignData(campaignId: string, keepDetail: boolean): void {
    queryClient.removeQueries({
      queryKey: campaignKey(campaignId),
      predicate: (query) => !(keepDetail && isDetail(query.queryKey)),
    });
    void queryClient.invalidateQueries({ queryKey: meKey("campaigns") });
  }

  const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { queryKey, state } = event.query;
    if (queryKey[0] !== "campaign" || typeof queryKey[1] !== "string") return;
    const campaignId = queryKey[1];

    if (!isDetail(queryKey)) {
      // Refused content of the campaign: check whether the rights changed.
      if (event.action.type === "error" && isApiError(state.error) && [403, 404].includes(state.error.status)) {
        recheckCampaign(campaignId);
      }
      return;
    }

    if (event.action.type === "success") {
      const role = (state.data as { role?: CampaignRole | null } | undefined)?.role ?? null;
      const before = knownRoles.get(campaignId);
      knownRoles.set(campaignId, role);
      if (before !== undefined && before !== role) {
        dropCampaignData(campaignId, true);
        rerunGuardIfOpen(campaignId);
      }
    } else if (event.action.type === "error" && isApiError(state.error) && [403, 404].includes(state.error.status)) {
      // The campaign is gone for this account (removed, left, deleted).
      if (!knownRoles.has(campaignId)) return;
      knownRoles.delete(campaignId);
      if (lastCampaignId.value === campaignId) rememberCampaign(null);
      // The detail goes too: its old data would let the guard in again.
      dropCampaignData(campaignId, false);
      rerunGuardIfOpen(campaignId);
    }
  });

  // A refused write in a campaign is the same hint as a refused read.
  const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "error") return;
    const error = event.mutation.state.error;
    const campaignId = currentCampaignId();
    if (campaignId && isApiError(error) && [403, 404].includes(error.status)) recheckCampaign(campaignId);
  });

  return () => {
    unhookBefore();
    unhookAfter();
    unsubscribeQueries();
    unsubscribeMutations();
  };
}
