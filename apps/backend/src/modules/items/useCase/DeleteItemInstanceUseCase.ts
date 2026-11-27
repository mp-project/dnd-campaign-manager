import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { DeleteItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

export class DeleteItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<DeleteItemInstanceDto>,
  void
> {
  protected readonly action = ITEM_ACTIONS.deleteInstance;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<DeleteItemInstanceDto>,
  ) {
    const { command, ...path } = input;

    await this.instances.delete(scope, path, command.expectedVersion);
  }
}
