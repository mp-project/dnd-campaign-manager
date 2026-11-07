import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
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
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const { feature, asset } = await this.featuresService.requireCatalogFeature(
      { ...viewer, isAdmin: isSysAdminRole(context.systemRole) },
      input.featureId,
      {
        visibleAssetIds,
        inUseAssetIds: await this.assetsService.listInUseAssetIds(viewer.campaignId),
        archived: "always",
      },
    );

    if (feature.campaignId !== viewer.campaignId) {
      throw new NotFoundError("Feature not found");
    }

    return this.featuresService.getUsages(viewer, asset.id, visibleAssetIds);
  }
}
