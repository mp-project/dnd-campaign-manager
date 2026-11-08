import type { RequestContext } from "#core/http/requestContext";
import type { RequestAssetDto } from "#src/modules/assets/domain/dto/RequestAssetDto";
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
    const access = await this.assetsService.access(context, campaignId);
    const filter = {
      assetType: query.assetType,
      where: access.listWhere("MANAGE", { status: query.status }),
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    };
    const { db, repository } = this.assetsService;
    const [page, total] = await Promise.all([
      repository.listPage(db, filter),
      repository.count(db, filter),
    ]);

    return toAssetListResponse({ page, view: access.viewer.view, limit: query.limit, total });
  }
}
