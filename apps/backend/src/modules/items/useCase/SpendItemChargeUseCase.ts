import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { SpendItemChargeDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/** Spends charges of a single piece. Answers with the full view of the instance. */
export class SpendItemChargeUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<SpendItemChargeDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.spendCharge;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<SpendItemChargeDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.spendCharge(scope, path, command));
  }
}
