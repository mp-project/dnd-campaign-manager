import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemSplitDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { SplitItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/** Not undoable for the same reason as a transfer: the new stack would stay. Merge it back instead. */
export class SplitItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<SplitItemInstanceDto>,
  ResponseItemSplitDto
> {
  protected readonly action = ITEM_ACTIONS.split;
  protected override readonly revertible = false;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<SplitItemInstanceDto>,
  ) {
    const { command, ...path } = input;
    const { source, split } = await this.instances.split(scope, path, command);

    return {
      source: await this.presenter.full(scope.tx, source),
      split: await this.presenter.full(scope.tx, split),
    };
  }
}
