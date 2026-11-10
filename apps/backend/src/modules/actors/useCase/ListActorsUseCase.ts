import type { RequestContext } from "#core/http/requestContext";
import type { RequestActorsQueryDto } from "#src/modules/actors/domain/dto/RequestActorDto";
import {
  type ResponseActorListDto,
  toActorListItemFullResponse,
  toActorListItemPlayerResponse,
  toActorListResponse,
} from "#src/modules/actors/domain/dto/ResponseActorDto";
import type { ActorListFilter } from "#src/modules/actors/domain/repository/ActorsRepository";
import { ActorsService } from "#src/modules/actors/service/ActorsService";
import type { AssetsService } from "#src/modules/assets/index";
import type { TagsService } from "#src/modules/tags/index";

/**
 * One list for characters, NPCs and monsters, filtered by category. GMs and editors see drafts and
 * active actors, archived ones on request. Players see active actors shared with them and nothing
 * else, whatever they ask for. Entries carry no parts; they come with the detail view.
 */
export class ListActorsUseCase {
  constructor(
    private readonly actorsService: ActorsService,
    private readonly assetsService: AssetsService,
    private readonly tagsService: TagsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestActorsQueryDto },
  ): Promise<ResponseActorListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { db, repository } = this.actorsService;
    const { query } = input;
    const isPlayer = !access.isFullView;
    const filter: ActorListFilter = {
      where: access.listWhere("MANAGE", { status: query.status }),
      limit: query.limit,
      cursor: query.cursor,
      category: query.category,
      creatureType: query.creatureType,
      size: query.size,
      search: query.search,
      // Players don't see tags, so their filter by tag is ignored.
      assetIds:
        isPlayer || query.tagId === undefined
          ? undefined
          : await this.tagsService.repository.listAssetIdsOfTag(this.tagsService.db, query.tagId),
    };
    const page = await repository.listPage(db, filter);

    if (isPlayer) {
      return toActorListResponse({
        page,
        data: page.items.map(toActorListItemPlayerResponse),
        limit: query.limit,
      });
    }

    const records = await this.actorsService.loadRecords(db, page.items);

    return toActorListResponse({
      page,
      data: records.map(toActorListItemFullResponse),
      limit: query.limit,
    });
  }
}
