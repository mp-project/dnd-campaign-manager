import type { RequestContext } from "#core/http/requestContext";
import {
  type AssetsService,
  type ContentAccess,
  type ContentReadMode,
  readContent,
} from "#src/modules/assets/index";
import {
  type ResponseFeatureDto,
  toFeatureFullResponse,
  toFeaturePlayerResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type { FeatureWithAsset } from "#src/modules/features/domain/repository/FeaturesRepository";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

export type FeatureReadMode = ContentReadMode;

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
    const { found, view, access } = await readContent(this.assetsService, context, this.mode, input.campaignId, {
      global: () => this.featuresService.requireSystemFeature(db, input.featureId),
      readable: (access, purpose) => this.featuresService.requireReadableFeature(access, input.featureId, purpose),
      notFound: "Feature not found",
    });

    if (view === "FULL") {
      return toFeatureFullResponse(await this.featuresService.loadRecord(db, found));
    }

    return this.toPlayer(found, access);
  }

  private async toPlayer(found: FeatureWithAsset, access: ContentAccess | null) {
    return toFeaturePlayerResponse(
      found,
      await this.featuresService.playerReferenceVisibility(this.featuresService.db, [found], access),
    );
  }
}
