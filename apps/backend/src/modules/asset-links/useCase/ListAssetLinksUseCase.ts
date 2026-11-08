import type { RequestContext } from "#core/http/requestContext";
import type { RequestAssetLinksQueryDto } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import {
  type ResponseAssetLinkListDto,
  toAssetLinkDirection,
  toAssetLinkFullResponse,
  toAssetLinkListResponse,
  toAssetLinkPlayerResponse,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import type { AssetsService } from "#src/modules/assets/index";

export type ListAssetLinksInput = {
  campaignId: string;
  assetId: string;
  query: RequestAssetLinksQueryDto;
};

/**
 * Players get pages filtered after loading, so a page can be shorter than `limit` while
 * `nextCursor` still points to more links.
 */
export class ListAssetLinksUseCase {
  constructor(
    private readonly linksService: AssetLinksService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: ListAssetLinksInput,
  ): Promise<ResponseAssetLinkListDto> {
    const access = await this.assetsService.access(context, input.campaignId);

    await this.assetsService.requireReadable(access, input.assetId);

    const page = await this.linksService.repository.listPage(this.linksService.db, {
      campaignId: access.viewer.campaignId,
      assetId: input.assetId,
      direction: input.query.direction,
      relationType: input.query.relationType,
      limit: input.query.limit,
      cursor: input.query.cursor,
    });
    const data = (await this.linksService.readableLinks(access, page.items, input.assetId)).map(
      ({ link, other }) => {
        const direction = toAssetLinkDirection(link, input.assetId);

        return access.isFullView
          ? toAssetLinkFullResponse(link, direction, other)
          : toAssetLinkPlayerResponse(link, direction, other);
      },
    );

    return toAssetLinkListResponse({
      data,
      lastLink: page.items.at(-1),
      hasMore: page.hasMore,
      limit: input.query.limit,
    });
  }
}
