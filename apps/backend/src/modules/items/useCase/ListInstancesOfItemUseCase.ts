import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestItemInstancesQueryDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ResponseItemInstanceListDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import type { ListItemInstancesUseCase } from "#src/modules/items/useCase/ListItemInstancesUseCase";

/**
 * Instances of one item of the catalog, for the GM and editors only: for players the answer would
 * tell which item an unidentified instance is, so they get 404 like for anything they may not see.
 */
export class ListInstancesOfItemUseCase {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly listInstances: ListItemInstancesUseCase,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; itemId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    const access = await this.assetsService.access(context, input.campaignId);

    if (!access.isFullView) {
      throw new NotFoundError("Item not found");
    }

    const found = await this.itemsService.requireReadableItem(access, input.itemId, "CATALOG");

    return this.listInstances.list(access, {
      campaignId: input.campaignId,
      query: { ...input.query, itemAssetId: found.asset.id },
    });
  }
}
