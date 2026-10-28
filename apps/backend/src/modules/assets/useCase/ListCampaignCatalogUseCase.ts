import type { RequestContext } from "#core/http/requestContext";
import type { AssetType } from "#src/modules/assets/domain/dto/BaseAssetDto";
import type { RequestAssetDto } from "#src/modules/assets/domain/dto/RequestAssetDto";
import {
  type ResponseAssetListDto,
  toAssetListResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class ListCampaignCatalogUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    assetType: AssetType,
    query: RequestAssetDto["campaignCatalogQuery"],
  ): Promise<ResponseAssetListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, campaignId);
    const isGm = viewer.view === "GM";

    const page = await this.assetsService.repository.listCatalog(this.assetsService.db, {
      assetType,
      rulesetId: viewer.rulesetId,
      campaign: {
        campaignId: viewer.campaignId,
        statuses: this.assetsService.campaignStatusesFor(viewer.view),
        visibleAssetIds: isGm ? undefined : await this.assetsService.listVisibleAssetIds(viewer),
      },
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });

    return toAssetListResponse({ page, view: viewer.view, limit: query.limit });
  }
}
