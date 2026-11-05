import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestMediaQueryDto } from "#src/modules/media/domain/dto/RequestMediaDto";
import {
  type ResponseMediaListDto,
  toMediaGmResponse,
  toMediaListResponse,
  toMediaPlayerResponse,
} from "#src/modules/media/domain/dto/ResponseMediaDto";
import type { MediaQuotaService } from "#src/modules/media/service/MediaQuotaService";
import { MediaService } from "#src/modules/media/service/MediaService";

export class ListMediaUseCase {
  constructor(
    private readonly mediaService: MediaService,
    private readonly assetsService: AssetsService,
    private readonly quota: MediaQuotaService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestMediaQueryDto },
  ): Promise<ResponseMediaListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const { db, repository } = this.mediaService;
    const { limit, cursor } = input.query;

    if (viewer.view === "PLAYER") {
      const page = await repository.listFilesPage(db, {
        campaignId: viewer.campaignId,
        limit,
        cursor,
        onAssetIds: await this.mediaService.listAssetIdsVisibleToPlayer(viewer),
      });

      return toMediaListResponse({
        page,
        data: page.items.map((file) => toMediaPlayerResponse(file, viewer.campaignId)),
        limit,
        storageUsage: null,
      });
    }

    const page = await repository.listFilesPage(db, {
      campaignId: viewer.campaignId,
      limit,
      cursor,
    });
    const usage = await repository.countAssignments(
      db,
      page.items.map((file) => file.id),
    );

    return toMediaListResponse({
      page,
      data: page.items.map((file) =>
        toMediaGmResponse(file, viewer.campaignId, usage.get(file.id) ?? 0),
      ),
      limit,
      storageUsage: await this.quota.findVisibleUsage(context, viewer.campaignId),
    });
  }
}
