import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import { AssetLinksService } from "#src/modules/asset-links/service/AssetLinksService";
import type { AssetsService } from "#src/modules/assets/index";

export class GetAssetUsagesUseCase {
  constructor(
    private readonly linksService: AssetLinksService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; assetId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );

    await this.linksService.requireReadableAsset(context, viewer, input.assetId, visibleAssetIds);

    return this.linksService.getUsages(viewer, input.assetId, visibleAssetIds);
  }
}
