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
    const access = await this.assetsService.access(context, input.campaignId);

    await this.assetsService.requireReadable(access, input.assetId);

    return this.linksService.getUsages(access, input.assetId);
  }
}
