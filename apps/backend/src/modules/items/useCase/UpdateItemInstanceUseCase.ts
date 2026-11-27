import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { UpdateItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/**
 * Changes the stored fields of an instance (owner, condition, notes …). Answers with the full view
 * of the instance.
 */
export class UpdateItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<UpdateItemInstanceDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.updateInstance;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<UpdateItemInstanceDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.update(scope, path, command));
  }
}
