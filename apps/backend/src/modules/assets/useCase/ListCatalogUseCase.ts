import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetType } from "#src/modules/assets/domain/dto/BaseAssetDto";
import type { RequestAssetDto } from "#src/modules/assets/domain/dto/RequestAssetDto";
import {
  type ResponseAssetListDto,
  toAssetListResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class ListCatalogUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    assetType: AssetType,
    query: RequestAssetDto["catalogQuery"],
  ): Promise<ResponseAssetListDto> {
    this.assetsService.assertAuthenticated(context);

    const page = await this.assetsService.repository.listCatalog(this.assetsService.db, {
      assetType,
      rulesetId: query.ruleset ?? null,
      campaign: null,
      search: query.search,
      limit: query.limit,
      cursor: query.cursor,
    });

    return toAssetListResponse({
      page,
      view: isSysAdminRole(context.systemRole) ? "GM" : "PLAYER",
      limit: query.limit,
    });
  }
}
