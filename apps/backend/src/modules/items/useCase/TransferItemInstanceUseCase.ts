import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemTransferDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { TransferItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/**
 * Not undoable in the history: a split is a smaller source plus a new instance, and undoing only the
 * source would create pieces out of nothing. A transfer is taken back by transferring again.
 */
export class TransferItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<TransferItemInstanceDto>,
  ResponseItemTransferDto
> {
  protected readonly action = ITEM_ACTIONS.transfer;
  protected override readonly revertible = false;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<TransferItemInstanceDto>,
  ) {
    const { command, ...path } = input;
    const { source, transferred } = await this.instances.transfer(scope, path, command);

    return {
      source: await this.presenter.full(scope.tx, source),
      transferred: await this.presenter.full(scope.tx, transferred),
    };
  }
}
