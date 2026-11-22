import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ListMediaLinksDto,
  type ResponseMediaLinkListDto,
  toMediaLinkResponse,
} from "#src/modules/media/domain/dto/MediaLinkDto";
import { MediaService, variantKindOf } from "#src/modules/media/service/MediaService";

/**
 * Links for a whole gallery in one request. Files the viewer may not see are left out instead of
 * failing the request, so one hidden file doesn't hide the others; the answer doesn't say why.
 */
export class ListMediaLinksUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; command: ListMediaLinksDto },
  ): Promise<ResponseMediaLinkListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const files = await this.mediaService.listFilesForViewer(access, input.command.mediaIds);
    const targets = await this.mediaService.resolveContentTargets(
      files,
      variantKindOf(input.command.variant),
    );

    return {
      data: await Promise.all(
        [...targets].map(async ([mediaId, target]) =>
          toMediaLinkResponse({
            mediaId,
            mimeType: target.mimeType,
            ...(await this.mediaService.createContentLink(target)),
          }),
        ),
      ),
    };
  }
}
