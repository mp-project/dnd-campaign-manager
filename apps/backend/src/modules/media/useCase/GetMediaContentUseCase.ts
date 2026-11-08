import type { Readable } from "node:stream";

import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import { normalizeFilename } from "#core/storage/filename";
import type { RequestMediaContentQueryDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import { MediaService } from "#src/modules/media/service/MediaService";

export type MediaContent =
  | { redirectUrl: string; headers: Record<string, string> }
  | { stream: Readable; headers: Record<string, string> };

/**
 * The rights are checked on every request. With object storage the request then continues there via
 * a short-lived signed link, so the bytes don't pass through the API and seeking in videos works; a
 * revoked right ends when the link does. Without such a storage the API streams the content itself.
 * Only images are shown inline; everything else downloads.
 */
export class GetMediaContentUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; mediaId: string; query: RequestMediaContentQueryDto },
  ): Promise<MediaContent> {
    const access = await this.assetsService.access(context, input.campaignId);
    const file = await this.mediaService.requireFileForViewer(access, input.mediaId);
    const target = await this.mediaService.resolveContentTarget(
      file,
      input.query.variant === "thumbnail"
        ? "THUMBNAIL"
        : input.query.variant === "display"
          ? "DISPLAY"
          : undefined,
    );
    const inline = target.mimeType.startsWith("image/") ? "inline" : "attachment";
    const disposition = `${inline}; filename="${normalizeFilename(file.originalName)}"`;

    if (this.mediaService.supportsDirectDownload) {
      return {
        redirectUrl: await this.mediaService.createContentUrl(target, { disposition }),
        // The browser may reuse the link for as long as it's guaranteed to work.
        headers: {
          "cache-control": `private, max-age=${this.mediaService.config.downloadUrlTtlSeconds}`,
        },
      };
    }

    return {
      stream: await this.mediaService.openContent(target),
      headers: {
        "content-type": target.mimeType,
        "content-length": String(target.sizeBytes),
        "content-disposition": disposition,
        "cache-control": "private, no-store",
        etag: `"${target.etag}"`,
        "x-content-type-options": "nosniff",
      },
    };
  }
}
