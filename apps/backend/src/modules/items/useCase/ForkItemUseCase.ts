import type { ContentViewer } from "#core/content/viewer";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { ForkItemDto } from "#src/modules/items/domain/dto/CreateItemDto";
import { type ResponseItemFullDto, toItemFullResponse } from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import { ItemMutation } from "#src/modules/items/useCase/ItemMutation";

type ForkInput = { campaignId: string; itemId: string; command: ForkItemDto };

/**
 * Copies an item of the catalog (global or the campaign's own) into a new custom item of the
 * campaign. The source must be readable in the catalog; the copy is checked like a new item.
 */
export class ForkItemUseCase extends ItemMutation<ForkInput, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.fork;
  /** Viewers resolved before the transaction, so it needs no second connection. */
  private readonly viewers = new WeakMap<ForkInput, ContentViewer>();

  constructor(
    history: HistoryPort,
    itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {
    super(history, itemsService);
  }

  protected override async prepare(context: RequestContext, input: ForkInput): Promise<void> {
    this.viewers.set(input, await this.assetsService.resolveCampaignViewer(context, input.campaignId));
  }

  protected async perform(scope: ActionScope, context: RequestContext, input: ForkInput) {
    const actorId = this.itemsService.actorIdOf(context);
    const viewer = this.viewers.get(input) as ContentViewer;
    const source = await this.itemsService.requireReadableItem(
      await this.assetsService.accessFor(viewer, scope.tx),
      input.itemId,
      "CATALOG",
      scope.tx,
    );

    return toItemFullResponse(
      await this.itemsService.forkItem(scope, { actorId, campaignId: input.campaignId, source }, input.command),
    );
  }
}
