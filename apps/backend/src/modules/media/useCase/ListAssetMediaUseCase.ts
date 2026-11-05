import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseAssetMediaListDto,
  toAssetMediaGmResponse,
  toAssetMediaPlayerResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import { MediaService } from "#src/modules/media/service/MediaService";

export class ListAssetMediaUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; assetId: string },
  ): Promise<ResponseAssetMediaListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const isPlayer = viewer.view === "PLAYER";
    const visibleAssetIds = new Set(
      isPlayer ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const asset = await this.assetsService.requireReadableInCampaign(
      context,
      viewer,
      input.assetId,
      visibleAssetIds,
    );
    const rows = await this.mediaService.repository.listAssignmentsOfAsset(
      this.mediaService.db,
      asset.id,
    );

    if (isPlayer) {
      return {
        data: rows
          .filter(
            ({ assignment, file }) =>
              assignment.visibility === "WITH_ASSET" && file.status === "READY",
          )
          .map(({ assignment, file }) => toAssetMediaPlayerResponse(assignment, file)),
      };
    }

    return {
      data: rows.map(({ assignment, file }) => toAssetMediaGmResponse(assignment, file)),
    };
  }
}
