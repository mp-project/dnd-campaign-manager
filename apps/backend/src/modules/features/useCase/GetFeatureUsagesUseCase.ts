import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/**
 * Where a custom feature is used: links and other definitions that refer to it. Players
 * only see usages whose other end they may see as well.
 */
export class GetFeatureUsagesUseCase {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; featureId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.featuresService.requireReadableFeature(
      access,
      input.featureId,
      "MANAGE",
    );

    return this.featuresService.getUsages(access, asset.id);
  }
}
