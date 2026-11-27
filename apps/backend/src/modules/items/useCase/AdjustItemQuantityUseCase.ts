import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { AdjustItemQuantityDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/** Raises or lowers the quantity of a stack. Answers with the full view of the instance. */
export class AdjustItemQuantityUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<AdjustItemQuantityDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.adjustQuantity;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<AdjustItemQuantityDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.adjustQuantity(scope, path, command));
  }
}
