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
    const access = await this.assetsService.access(context, input.campaignId);
    const asset = await this.assetsService.requireReadable(access, input.assetId);
    const { db, repository } = this.tagsService;
    const tags = await repository.listForAsset(db, asset.id);

    if (!access.isFullView) {
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
