import { queryOptions } from "@tanstack/vue-query";

import { cachePolicy } from "@/core/api/cachePolicy";
import { campaignKey } from "@/core/api/queryClient";

import type { MediaVariant } from "./api";
import { loadMediaLink } from "./linkLoader";

/** The link of a file for `<img src>` and the like; kept until shortly before it expires. */
export function mediaLinkQuery(campaignId: string, mediaId: string, variant?: MediaVariant) {
  return queryOptions({
    queryKey: campaignKey(campaignId, "media", mediaId, "link", variant ?? "original"),
    queryFn: () => loadMediaLink(campaignId, mediaId, variant),
    ...cachePolicy("signedUrl"),
  });
}
