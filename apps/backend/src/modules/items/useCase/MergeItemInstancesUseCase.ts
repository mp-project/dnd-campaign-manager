import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { MergeItemInstancesDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/**
 * Answers with the stack the pieces went to. Not undoable: the merged stack is deleted, and undoing
 * only the bigger stack would create pieces. Split the pieces off again instead.
 */
export class MergeItemInstancesUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<MergeItemInstancesDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.merge;
  protected override readonly revertible = false;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<MergeItemInstancesDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.merge(scope, path, command));
  }
}
