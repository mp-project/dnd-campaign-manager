import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseAssetMediaListDto,
  toAssetMediaFullResponse,
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
    const access = await this.assetsService.access(context, input.campaignId);
    const isPlayer = !access.isFullView;
    const asset = await this.assetsService.requireReadable(access, input.assetId);
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
      data: rows.map(({ assignment, file }) => toAssetMediaFullResponse(assignment, file)),
    };
  }
}
