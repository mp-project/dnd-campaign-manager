import type { RequestContext } from "#core/http/requestContext";
import type { RequestAssetDto } from "#src/modules/assets/domain/dto/RequestAssetDto";
import type { CampaignAssetListFilter } from "#src/modules/assets/domain/repository/AssetsRepository";
import {
  type ResponseAssetListDto,
  toAssetListResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class ListCampaignAssetsUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    query: RequestAssetDto["campaignAssetsQuery"],
  ): Promise<ResponseAssetListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, campaignId);
    const allowedStatuses = this.assetsService.campaignStatusesFor(viewer.view);
    const isGm = viewer.view === "GM";

    if (query.status && !isGm && !allowedStatuses.includes(query.status)) {
      return toAssetListResponse({
        page: { items: [], hasMore: false },
        view: viewer.view,
        limit: query.limit,
        total: 0,
      });
    }

    const filter: CampaignAssetListFilter = {
      campaignId: viewer.campaignId,
      assetType: query.assetType,
      statuses: query.status ? [query.status] : isGm ? undefined : allowedStatuses,
      visibleAssetIds: isGm ? undefined : await this.assetsService.listVisibleAssetIds(viewer),
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    };

    const [page, total] = await Promise.all([
      this.assetsService.repository.listCampaignAssets(this.assetsService.db, filter),
      this.assetsService.repository.countCampaignAssets(this.assetsService.db, filter),
    ]);

    return toAssetListResponse({ page, view: viewer.view, limit: query.limit, total });
  }
}
