import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/**
 * Where a background is used in the current campaign: links and content that refers to it. Players
 * only see usages whose other end they may see as well. `ownOnly` limits it to custom backgrounds,
 * for the route under `/backgrounds`; the catalog route also answers for global ones.
 */
export class GetBackgroundUsagesUseCase {
  constructor(
    private readonly backgroundsService: BackgroundsService,
    private readonly assetsService: AssetsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; backgroundId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.backgroundsService.requireReadableBackground(
      access,
      input.backgroundId,
      this.ownOnly ? "MANAGE" : "CATALOG",
    );

    return this.backgroundsService.getUsages(access, asset.id);
  }
}
