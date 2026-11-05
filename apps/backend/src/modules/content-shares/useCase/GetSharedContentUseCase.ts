import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseSharedContentDto,
  toSharedContentResponse,
} from "#src/modules/content-shares/domain/dto/ResponseContentShareDto";
import { ContentSharesService } from "#src/modules/content-shares/service/ContentSharesService";

/** Resolves a share to its content, so the client needs nothing but the share id. */
export class GetSharedContentUseCase {
  constructor(
    private readonly sharesService: ContentSharesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; shareId: string },
  ): Promise<ResponseSharedContentDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const { share, asset, content } = await this.sharesService.loadSharedContent(
      viewer,
      input.shareId,
    );

    return toSharedContentResponse(share, asset, content);
  }
}
