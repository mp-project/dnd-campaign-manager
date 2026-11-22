import { z } from "zod";

import { isoDateTimeDto, uuidDto } from "#core/http/dto";
import { mediaVariantDto } from "#src/modules/media/domain/dto/RequestMediaDto";

/** Enough for a gallery page; larger galleries ask in pages. */
export const MEDIA_LINKS_MAX_IDS = 100;

export const ListMediaLinksSchema = z.strictObject({
  mediaIds: z.array(uuidDto).min(1).max(MEDIA_LINKS_MAX_IDS),
  variant: mediaVariantDto.optional(),
});

/** A signed link carries what it delivers; its signature is checked by the route, not the schema. */
export const RequestMediaLinkContentParamsSchema = z.strictObject({
  token: z.string().min(1).max(4096),
});

/**
 * A link the browser loads without a session (`<img src>`, `<video src>`, downloads). It works at
 * least until `expiresAt`; within one time window it stays the same, so the browser can cache.
 */
export const ResponseMediaLinkSchema = z.strictObject({
  mediaId: uuidDto,
  url: z.string().min(1),
  expiresAt: isoDateTimeDto,
  /**
   * The same time as seconds from now, for clients whose clock is off: they count from when the
   * answer arrived instead of comparing `expiresAt` with their own clock.
   */
  expiresInSeconds: z.number().int().nonnegative(),
  /** Of what the link delivers: a variant is WebP, whatever the original is. */
  mimeType: z.string().min(1),
});

/** Files the viewer may not see, or that have no content yet, are left out. */
export const ResponseMediaLinkListSchema = z.strictObject({
  data: z.array(ResponseMediaLinkSchema),
});

export type ListMediaLinksDto = z.infer<typeof ListMediaLinksSchema>;
export type ResponseMediaLinkDto = z.infer<typeof ResponseMediaLinkSchema>;
export type ResponseMediaLinkListDto = z.infer<typeof ResponseMediaLinkListSchema>;

export function toMediaLinkResponse(
  link: { mediaId: string; mimeType: string; url: string; expiresAt: Date },
  now: number = Date.now(),
): ResponseMediaLinkDto {
  return {
    mediaId: link.mediaId,
    url: link.url,
    expiresAt: link.expiresAt.toISOString(),
    expiresInSeconds: Math.max(0, Math.floor((link.expiresAt.getTime() - now) / 1000)),
    mimeType: link.mimeType,
  };
}
