import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestTagsQueryDto } from "#src/modules/tags/domain/dto/RequestTagDto";
import {
  type ResponseTagListDto,
  toTagFullResponse,
  toTagListResponse,
  toTagPlayerResponse,
} from "#src/modules/tags/domain/dto/ResponseTagDto";
import { TagsService } from "#src/modules/tags/service/TagsService";

export class ListTagsUseCase {
  constructor(
    private readonly tagsService: TagsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestTagsQueryDto },
  ): Promise<ResponseTagListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { viewer } = access;
    const { db, repository } = this.tagsService;

    if (viewer.view === "PLAYER") {
      const page = await repository.listPage(db, {
        campaignId: viewer.campaignId,
        limit: input.query.limit,
        cursor: input.query.cursor,
        onAssetIds: await access.listReadableOwnIds(),
      });

      return toTagListResponse({
        page,
        data: page.items.map(toTagPlayerResponse),
        limit: input.query.limit,
      });
    }

    const page = await repository.listPage(db, {
      campaignId: viewer.campaignId,
      limit: input.query.limit,
      cursor: input.query.cursor,
    });
    const usage = await repository.countUsages(
      db,
      page.items.map((tag) => tag.id),
    );

    return toTagListResponse({
      page,
      data: page.items.map((tag) => toTagFullResponse(tag, usage.get(tag.id) ?? 0)),
      limit: input.query.limit,
    });
  }
}
