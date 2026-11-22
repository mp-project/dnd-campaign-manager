import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseMediaLinkDto,
  toMediaLinkResponse,
} from "#src/modules/media/domain/dto/MediaLinkDto";
import type { RequestMediaContentQueryDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import { MediaService, variantKindOf } from "#src/modules/media/service/MediaService";

/**
 * The content route as data: the same rights, but the link is returned instead of followed, because
 * a browser loading `<img src>` can't send the session token.
 */
export class GetMediaLinkUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; mediaId: string; query: RequestMediaContentQueryDto },
  ): Promise<ResponseMediaLinkDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const file = await this.mediaService.requireFileForViewer(access, input.mediaId);
    const target = await this.mediaService.resolveContentTarget(
      file,
      variantKindOf(input.query.variant),
    );

    return toMediaLinkResponse({
      mediaId: file.id,
      mimeType: target.mimeType,
      ...(await this.mediaService.createContentLink(target)),
    });
  }
}
