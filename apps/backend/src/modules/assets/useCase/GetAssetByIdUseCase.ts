import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import {
  type ResponseAssetDto,
  toAssetGmResponse,
  toAssetPlayerResponse,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { AssetsService } from "#src/modules/assets/service/AssetsService";

export class GetAssetByIdUseCase {
  constructor(private readonly assetsService: AssetsService) {}

  async execute(
    context: RequestContext,
    assetId: string,
  ): Promise<ResponseAssetDto> {
    this.assetsService.assertAuthenticated(context);
    const asset = await this.assetsService.requireAsset(this.assetsService.db, assetId);
    const record = await this.assetsService.toRecord(this.assetsService.db, asset);

    if (isSysAdminRole(context.systemRole)) {
      return toAssetGmResponse(record);
    }

    if (asset.scope === "SYSTEM") {
      if (asset.status !== "ACTIVE") {
        throw new NotFoundError("Asset not found");
      }

      return toAssetPlayerResponse(record);
    }

    const viewer = await this.assetsService
      .resolveCampaignViewer(context, asset.campaignId as string)
      .catch((error: unknown) => {
        throw error instanceof NotFoundError ? new NotFoundError("Asset not found") : error;
      });

    if (viewer.view === "GM") {
      return toAssetGmResponse(record);
    }

    const visibleAssetIds = await this.assetsService.listVisibleAssetIds(viewer);

    if (asset.status !== "ACTIVE" || !visibleAssetIds.includes(asset.id)) {
      throw new NotFoundError("Asset not found");
    }

    return toAssetPlayerResponse(record);
  }
}
