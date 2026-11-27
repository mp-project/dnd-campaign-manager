import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateItemDto } from "#src/modules/items/domain/dto/CreateItemDto";
import { type ResponseItemFullDto, toItemFullResponse } from "#src/modules/items/domain/dto/ResponseItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemMutation, type ItemScoped } from "#src/modules/items/useCase/ItemMutation";

export type CreateItemInput = ItemScoped & { command: CreateItemDto };

export class CreateItemUseCase extends ItemMutation<CreateItemInput, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.create;

  protected async perform(scope: ActionScope, context: RequestContext, input: CreateItemInput) {
    const actorId = this.itemsService.actorIdOf(context);

    return toItemFullResponse(
      await this.itemsService.createItem(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}
