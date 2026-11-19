import { queryOptions } from "@tanstack/vue-query";

import { cachePolicy } from "@/core/api/cachePolicy";
import { campaignKey, meKey } from "@/core/api/queryClient";

import { listInvitations, listMyInvitations } from "./api";

/** The campaign's pending invitations (game master). */
export function invitationsQuery(campaignId: string) {
  return queryOptions({
    queryKey: campaignKey(campaignId, "invitations"),
    queryFn: () => listInvitations(campaignId),
    ...cachePolicy("list"),
  });
}

/** The signed-in account's own pending invitations (dashboard). */
export const myInvitationsQuery = queryOptions({
  queryKey: meKey("invitations"),
  queryFn: listMyInvitations,
  ...cachePolicy("private"),
});
