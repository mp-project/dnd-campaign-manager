import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseItemKnowledgeDto,
  toKnowledgeResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { IdentifyItemInstanceDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import {
  ItemInstanceMutation,
  type ItemInstanceCommand,
} from "#src/modules/items/useCase/ItemInstanceMutation";

export class IdentifyItemInstanceUseCase extends ItemInstanceMutation<
  ItemInstanceCommand<IdentifyItemInstanceDto>,
  ResponseItemKnowledgeDto
> {
  protected readonly action = ITEM_ACTIONS.identify;

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: ItemInstanceCommand<IdentifyItemInstanceDto>,
  ) {
    const { command, ...path } = input;

    return toKnowledgeResponse(await this.instances.identify(scope, path, command));
  }
}
