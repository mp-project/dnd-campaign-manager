import type { RequestContext } from "#core/http/requestContext";
import type { RequestAssetLinksQueryDto } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import {
  type ResponseAssetLinkDto,
  type ResponseAssetLinkListDto,
  toAssetLinkDirection,
  toAssetLinkGmResponse,
  toAssetLinkListResponse,
  toAssetLinkPlayerResponse,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import {
  AssetLinksService,
  otherEndOf,
} from "#src/modules/asset-links/service/AssetLinksService";
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
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );

    await this.linksService.requireReadableAsset(context, viewer, input.assetId, visibleAssetIds);

    const page = await this.linksService.repository.listPage(this.linksService.db, {
      campaignId: viewer.campaignId,
      assetId: input.assetId,
      direction: input.query.direction,
      relationType: input.query.relationType,
      limit: input.query.limit,
      cursor: input.query.cursor,
    });
    const related = await this.assetsService.findMany(
      page.items.map((link) => otherEndOf(link, input.assetId)),
    );
    const data: ResponseAssetLinkDto[] = [];

    for (const link of page.items) {
      const other = related.get(otherEndOf(link, input.assetId));
      const direction = toAssetLinkDirection(link, input.assetId);

      if (viewer.view === "GM" && other) {
        data.push(toAssetLinkGmResponse(link, direction, other));
      } else if (
        viewer.view === "PLAYER" &&
        this.linksService.canPlayerSeeLink(link, other, visibleAssetIds)
      ) {
        data.push(toAssetLinkPlayerResponse(link, direction, other));
      }
    }

    return toAssetLinkListResponse({
      data,
      lastLink: page.items.at(-1),
      hasMore: page.hasMore,
      limit: input.query.limit,
    });
  }
}
