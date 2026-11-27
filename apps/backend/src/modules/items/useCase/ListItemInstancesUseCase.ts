import { ValidationError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type { RequestItemInstancesQueryDto } from "#src/modules/items/domain/dto/RequestItemDto";
import {
  type ResponseItemInstanceListDto,
  toItemInstancePageResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import type { ItemInstancePresenter } from "#src/modules/items/useCase/ItemInstancePresenter";

/** Filters that would let players test for what their view hides (definition, owner). */
const HIDDEN_FILTERS = ["itemAssetId", "ownerType", "ownerAssetId"] as const;

export class ListItemInstancesUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly assetsService: AssetsService,
    private readonly presenter: ItemInstancePresenter,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    return this.list(await this.assetsService.access(context, input.campaignId), input);
  }

  /**
   * Instances for a loaded access session. Players only get instances they know of and may only
   * filter by what they see (`equipped`, `attuned`, the known name); the filters on definition and
   * owner are refused for them (400), because an empty or full answer would tell what an
   * unidentified item is or who has it.
   */
  async list(
    access: ContentAccess,
    input: { campaignId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    const { query } = input;

    if (!access.isFullView && HIDDEN_FILTERS.some((filter) => query[filter] !== undefined)) {
      throw new ValidationError("Players can filter item instances by equipped, attuned and search only");
    }

    const page = await this.instances.repository.listPage(this.instances.db, {
      campaignId: input.campaignId,
      limit: query.limit,
      cursor: query.cursor,
      itemAssetId: query.itemAssetId,
      ownerType: query.ownerType,
      ownerAssetId: query.ownerAssetId,
      equipped: query.equipped,
      attuned: query.attuned,
      search: query.search,
      knownBy: access.isFullView ? undefined : access.viewer.actorId,
    });

    return toItemInstancePageResponse({
      page,
      data: await this.presenter.present(access, page.items),
      limit: query.limit,
    });
  }
}
