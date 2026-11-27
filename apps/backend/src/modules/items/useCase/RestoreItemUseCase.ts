import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { type ResponseItemFullDto, toItemFullResponse } from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemLifecycleCommandDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import { ITEM_ACTIONS } from "#src/modules/items/history/TrackedItem";
import { ItemMutation, type ItemScoped } from "#src/modules/items/useCase/ItemMutation";

export type RestoreItemInput = ItemScoped & { itemId: string; command: ItemLifecycleCommandDto };

/** Restores an archived item; checked again at the end of the action. */
export class RestoreItemUseCase extends ItemMutation<RestoreItemInput, ResponseItemFullDto> {
  protected readonly action = ITEM_ACTIONS.restore;

  protected async perform(scope: ActionScope, _context: RequestContext, input: RestoreItemInput) {
    const found = await this.itemsService.requireScopedItem(scope.tx, input);

    await this.itemsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: false,
    });

    return toItemFullResponse(
      await this.itemsService.loadRecord(scope.tx, await this.itemsService.requireItem(scope.tx, found.item.id)),
    );
  }
}
