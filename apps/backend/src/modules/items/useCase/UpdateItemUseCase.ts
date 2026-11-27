import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateItemDto,
  toItemFullResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { UpdateItemDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemMutation, type ItemScoped } from "#src/modules/items/useCase/ItemMutation";

export type UpdateItemInput = ItemScoped & { itemId: string; command: UpdateItemDto };

export class UpdateItemUseCase extends ItemMutation<UpdateItemInput, ResponseUpdateItemDto> {
  protected readonly action = ITEM_ACTIONS.update;

  protected async perform(scope: ActionScope, context: RequestContext, input: UpdateItemInput) {
    const actorId = this.itemsService.actorIdOf(context);
    const found = await this.itemsService.requireScopedItem(scope.tx, input);
    const { record, merged } = await this.itemsService.updateItem(scope, { found, actorId, command: input.command });

    return { ...toItemFullResponse(record), merged };
  }
}
