import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestTagsQueryDto } from "#src/modules/tags/domain/dto/RequestTagDto";
import {
  type ResponseTagListDto,
  toTagGmResponse,
  toTagListResponse,
  toTagPlayerResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import { TagsService } from "#src/modules/tags/service/TagsService";

export class ListTagsUseCase {
  constructor(
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestTagsQueryDto },
  ): Promise<ResponseTagListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const { db, repository } = this.tagsService;

    if (viewer.view === "PLAYER") {
      const page = await repository.listPage(db, {
        campaignId: viewer.campaignId,
        limit: input.query.limit,
        cursor: input.query.cursor,
        onAssetIds: await this.listPlayerAssetIds(viewer),
      });

      return toTagListResponse({
        page,
        data: page.items.map(toTagPlayerResponse),
        limit: input.query.limit,
      });
    }

    const page = await repository.listPage(db, {
      campaignId: viewer.campaignId,
      limit: input.query.limit,
      cursor: input.query.cursor,
    });
    const usage = await repository.countUsages(
      db,
      page.items.map((tag) => tag.id),
    );

    return toTagListResponse({
      page,
      data: page.items.map((tag) => toTagGmResponse(tag, usage.get(tag.id) ?? 0)),
      limit: input.query.limit,
    });
  }

  /** Assets of the campaign that players see; archived ones stay hidden even when shared. */
  private async listPlayerAssetIds(
    viewer: Parameters<AssetsService["listVisibleAssetIds"]>[0],
  ): Promise<string[]> {
    const visibleIds = await this.assetsService.listVisibleAssetIds(viewer);
    const visible = new Set(visibleIds);
    const found = await this.assetsService.findMany(visibleIds);

    return [...found.values()]
      .filter((asset) => this.assetsService.isVisibleToPlayer(asset, visible))
      .map((asset) => asset.id);
  }
}
