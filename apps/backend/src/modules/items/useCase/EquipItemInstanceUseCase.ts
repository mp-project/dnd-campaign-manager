import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { EquipItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/** Equips or unequips an instance an actor holds. Answers with the full view of the instance. */
export class EquipItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<EquipItemInstanceDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.equip;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<EquipItemInstanceDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.equip(scope, path, command));
  }
}
