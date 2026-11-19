import { queryOptions } from "@tanstack/vue-query";

import { cachePolicy } from "@/core/api/cachePolicy";
import { campaignKey } from "@/core/api/queryClient";

import { listMembers } from "./api";

/** The campaign's active members: the party in the overview and the members of the sharing page. */
export function membersQuery(campaignId: string) {
  return queryOptions({
    queryKey: campaignKey(campaignId, "members"),
    queryFn: () => listMembers(campaignId),
    ...cachePolicy("list"),
  });
}
