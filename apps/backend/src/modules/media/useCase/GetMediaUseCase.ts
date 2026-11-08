import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseMediaDto,
  toMediaFullResponse,
  toMediaPlayerResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import { MediaService } from "#src/modules/media/service/MediaService";

export class GetMediaUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; mediaId: string },
  ): Promise<ResponseMediaDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { viewer } = access;
    const file = await this.mediaService.requireFileForViewer(access, input.mediaId);

    if (viewer.view === "PLAYER") {
      return toMediaPlayerResponse(file, viewer.campaignId);
    }

    const { db, repository } = this.mediaService;
    const usage = await repository.countAssignments(db, [file.id]);

    return toMediaFullResponse(file, viewer.campaignId, usage.get(file.id) ?? 0);
  }
}
