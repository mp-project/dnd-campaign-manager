import type { Readable } from "node:stream";

import {
  MediaService,
  streamedContentHeaders,
} from "#src/modules/media/service/MediaService";

/**
 * Delivers a signed link of `GetMediaLinkUseCase` for storages a browser can't fetch from itself.
 * No session: the signature stands for the rights checked when the link was handed out.
 */
export class GetMediaLinkContentUseCase {
  constructor(private readonly mediaService: MediaService) {}

  async execute(input: {
    token: string;
  }): Promise<{ stream: Readable; headers: Record<string, string> }> {
    const { target, stream } = await this.mediaService.openLinkedContent(input.token);

    return {
      stream,
      headers: {
        ...streamedContentHeaders(target),
        // The link names exactly this content and stays the same within its time window.
        "cache-control": `private, max-age=${this.mediaService.config.downloadUrlTtlSeconds}`,
      },
    };
  }
}
