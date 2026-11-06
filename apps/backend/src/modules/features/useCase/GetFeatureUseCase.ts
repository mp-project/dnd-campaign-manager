import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseFeatureDto,
  toFeatureGmResponse,
  toFeaturePlayerResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type { FeatureWithAsset } from "#src/modules/features/domain/repository/FeaturesRepository";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/**
 * Where the feature is read: `campaign` only finds custom features of the campaign, `catalog` also
 * global ones for the campaign ruleset, `system` only global ones.
 */
export type FeatureReadMode = "campaign" | "catalog" | "system";

/**
 * GMs and editors get the full view of what the campaign may use, players the player view of active
 * features they may see. Outside a campaign, administrators get the full view of global features
 * and everybody else the player view of active ones.
 */
export class GetFeatureUseCase {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly assetsService: AssetsService,
    private readonly mode: FeatureReadMode,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId?: string | undefined; featureId: string },
  ): Promise<ResponseFeatureDto> {
    const { db } = this.featuresService;

    if (this.mode === "system") {
      this.assetsService.assertAuthenticated(context);

      const found = await this.featuresService.requireSystemFeature(db, input.featureId);

      if (isSysAdminRole(context.systemRole)) {
        return toFeatureGmResponse(await this.featuresService.loadRecord(db, found));
      }

      if (found.asset.status !== "ACTIVE") {
        throw new NotFoundError("Feature not found");
      }

      return this.toPlayer(found, new Set());
    }

    const viewer = await this.assetsService.resolveCampaignViewer(
      context,
      input.campaignId as string,
    );
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const found = await this.featuresService.requireCatalogFeature(
      { ...viewer, isAdmin: isSysAdminRole(context.systemRole) },
      input.featureId,
      visibleAssetIds,
    );

    if (this.mode === "campaign" && found.feature.campaignId !== viewer.campaignId) {
      throw new NotFoundError("Feature not found");
    }

    if (viewer.view === "PLAYER") {
      return this.toPlayer(found, visibleAssetIds);
    }

    return toFeatureGmResponse(await this.featuresService.loadRecord(db, found));
  }

  private async toPlayer(found: FeatureWithAsset, visibleAssetIds: ReadonlySet<string>) {
    return toFeaturePlayerResponse(
      found,
      await this.featuresService.playerReferenceVisibility(
        this.featuresService.db,
        [found],
        visibleAssetIds,
      ),
    );
  }
}
