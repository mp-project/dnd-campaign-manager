import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { AttuneItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

/** Attunes an actor to an instance or ends it. Answers with the full view of the instance. */
export class AttuneItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<AttuneItemInstanceDto>,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.attune;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<AttuneItemInstanceDto>,
  ) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.attune(scope, path, command));
  }
}
