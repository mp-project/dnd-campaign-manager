import { api, type ApiData, unwrap } from "@/core/api/client";

export type MediaLink = ApiData<"getMediaLink">;
/** Without a variant the original; a variant that isn't ready yet delivers the original too. */
export type MediaVariant = "thumbnail" | "display";

/** The most ids `listMediaLinks` takes at once. */
export const MEDIA_LINKS_MAX_IDS = 100;

/** A link the browser loads without the session token (`<img src>`), checked like the content. */
export function getMediaLink(campaignId: string, mediaId: string, variant?: MediaVariant) {
  return unwrap(
    api.GET("/api/v1/campaigns/{campaignId}/media/{mediaId}/link", {
      params: { path: { campaignId, mediaId }, query: variant ? { variant } : {} },
    }),
  );
}

/** Links for many files at once; files the viewer may not see are left out. */
export function listMediaLinks(campaignId: string, mediaIds: string[], variant?: MediaVariant) {
  return unwrap(
    api.POST("/api/v1/campaigns/{campaignId}/media/links", {
      params: { path: { campaignId } },
      body: variant ? { mediaIds, variant } : { mediaIds },
    }),
  );
}
