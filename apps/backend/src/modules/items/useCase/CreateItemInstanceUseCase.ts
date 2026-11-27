import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseItemInstanceFullDto } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { CreateItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemInstanceMutation } from "#src/modules/items/useCase/ItemInstanceMutation";

export type CreateItemInstanceInput = { campaignId: string; command: CreateItemInstanceDto };

export class CreateItemInstanceUseCase extends ItemInstanceMutation<
  CreateItemInstanceInput,
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.createInstance;

  protected async perform(scope: ActionScope, _context: RequestContext, input: CreateItemInstanceInput) {
    return this.presenter.full(scope.tx, await this.instances.create(scope, input, input.command));
  }
}
