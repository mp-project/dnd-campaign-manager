import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseAssetTagsDto,
  toTagFullResponse,
  toTagPlayerResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import { TagsService } from "#src/modules/tags/service/TagsService";

export class ListAssetTagsUseCase {
  constructor(
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; assetId: string },
  ): Promise<ResponseAssetTagsDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const asset = await this.assetsService.requireReadableInCampaign(
      context,
      viewer,
      input.assetId,
      visibleAssetIds,
    );
    const { db, repository } = this.tagsService;
    const tags = await repository.listForAsset(db, asset.id);

    if (viewer.view === "PLAYER") {
      return { view: "PLAYER", assetId: asset.id, tags: tags.map(toTagPlayerResponse) };
    }

    const usage = await repository.countUsages(
      db,
      tags.map((tag) => tag.id),
    );

    return {
      view: "FULL",
      assetId: asset.id,
      assetVersion: asset.version,
      tags: tags.map((tag) => toTagFullResponse(tag, usage.get(tag.id) ?? 0)),
    };
  }
}
