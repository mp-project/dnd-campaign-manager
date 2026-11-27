import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { type ResponseItemFullDto, toItemFullResponse } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemLifecycleCommandDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemMutation, type ItemScoped } from "#src/modules/items/useCase/ItemMutation";

export type DeleteItemInput = ItemScoped & { itemId: string; command: ItemLifecycleCommandDto };

/** Archives the item; it can be restored. Fails while content or instances need it. */
export class DeleteItemUseCase extends ItemMutation<DeleteItemInput, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.delete;

  protected async perform(scope: ActionScope, _context: RequestContext, input: DeleteItemInput) {
    const found = await this.itemsService.requireScopedItem(scope.tx, input);

    await this.itemsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: true,
    });

    return toItemFullResponse(
      await this.itemsService.loadRecord(scope.tx, await this.itemsService.requireItem(scope.tx, found.item.id)),
    );
  }
}
