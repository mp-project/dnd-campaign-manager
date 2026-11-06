import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import type { ResolveFeatureDto } from "#src/modules/features/domain/dto/RequestFeatureDto";
import {
  type ResponseResolvedFeatureDto,
  toResolvedFeatureResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/**
 * Values of a feature for one actor, with parameters, choices and scaling bound. Everybody who may
 * see the feature in the campaign may ask, players included; nothing is stored.
 */
export class ResolveFeatureUseCase {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; featureId: string; command: ResolveFeatureDto },
  ): Promise<ResponseResolvedFeatureDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const found = await this.featuresService.requireCatalogFeature(
      { ...viewer, isAdmin: isSysAdminRole(context.systemRole) },
      input.featureId,
      visibleAssetIds,
    );
    const resolved = await this.featuresService.resolveFeature(found, {
      viewer,
      visibleAssetIds,
      bindings: input.command.bindings,
      actor: input.command.actor,
    });

    return toResolvedFeatureResponse(found, viewer.rulesetId, resolved);
  }
}
