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
    const access = await this.assetsService.access(context, campaignId);
    const page = await this.assetsService.repository.listPage(this.assetsService.db, {
      assetType,
      where: access.listWhere("CATALOG"),
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });

    return toAssetListResponse({ page, view: access.viewer.view, limit: query.limit });
  }
}
